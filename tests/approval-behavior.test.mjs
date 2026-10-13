import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { sqliteD1 } from "./helpers/sqlite-d1.mjs";
import { env } from "./helpers/cloudflare.mjs";

register("./helpers/worker-loader.mjs", import.meta.url);
const { POST: assistant } = await import("../app/api/assistant/route.ts");
const { POST: tools } = await import("../app/api/mcp/tools/route.ts");
const { callMcpTool, ownerId } = await import("../lib/mcp-hub.ts");
const realFetch = globalThis.fetch;
let db, writes, modelCalls, failModel, nextApproval;

function request(payload = {}, owner = "alice@example.test") {
  return new Request("https://terracotta.example/api/assistant", {
    method: "POST", headers: { "content-type": "application/json", ...(owner ? { "oai-authenticated-user-email": owner } : {}) }, body: JSON.stringify(payload),
  });
}

function seedApproval({ runId = "run-1", token = "token-1", owner = "alice@example.test", expires = new Date(Date.now() + 60_000).toISOString() } = {}) {
  const tool = { alias: "mcp_custom_write_record", kind: "mcp", connectionId: "custom", connectionName: "Test MCP", toolName: "write_record", description: "write", inputSchema: {}, risk: "write" };
  const calls = [{ callId: "call-1", alias: tool.alias, args: { value: "approved" }, tool }];
  db.sqlite.prepare("INSERT OR REPLACE INTO orchestration_runs (id, owner_id, prompt, preference, task_kind, provider, model_id, state_json, tools_json, pending_calls_json, trace_json, status, expires_at) VALUES (?, ?, 'update the record', 'gpt', 'general', 'openai', 'test-model', ?, ?, ?, '[]', 'approval_required', ?)")
    .run(runId, owner, JSON.stringify({ kind: "openai", input: [], approvalToken: token }), JSON.stringify([tool]), JSON.stringify(calls), expires);
  return `${runId}:${token}`;
}

beforeEach(async () => {
  db = sqliteD1(); writes = 0; modelCalls = 0; failModel = false; nextApproval = false;
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, { DB: db, OPENAI_API_KEY: "test-only-key" });
  const migrations = new URL("../drizzle/", import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith(".sql")).sort()) db.sqlite.exec(await readFile(new URL(name, migrations), "utf8"));
  db.sqlite.prepare("INSERT INTO model_registry (key, provider, model_id, display_name, is_routable) VALUES ('test-model','openai','test-model','Test model',1)").run();
  db.sqlite.prepare("INSERT INTO provider_sync (provider, status, current_model) VALUES ('openai','ready','test-model')").run();
  db.sqlite.prepare("INSERT INTO mcp_connections (id, owner_id, name, server_url, status, auth_type, tools_json) VALUES ('custom','alice@example.test','Test MCP','https://mcp.example.test','connected','none',?)")
    .run(JSON.stringify([{ name: "write_record" }, { name: "get_record", annotations: { readOnlyHint: true } }]));
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    if (String(url).startsWith("https://mcp.example.test")) {
      if (body.method === "tools/call" && body.params.name === "write_record") writes++;
      return Response.json({ jsonrpc: "2.0", id: body.id, result: { content: [{ type: "text", text: "ok" }] } });
    }
    if (String(url) === "https://api.openai.com/v1/responses") {
      modelCalls++;
      if (failModel) return new Response("upstream unavailable", { status: 503 });
      if (nextApproval) {
        nextApproval = false;
        return Response.json({ output: [{ type: "function_call", call_id: "call-2", name: "mcp_custom_write_record", arguments: JSON.stringify({ value: "second action" }) }], usage: {} });
      }
      return Response.json({ output: [{ content: [{ type: "output_text", text: "done" }] }], usage: {} });
    }
    throw new Error(`Unexpected network request: ${url}`);
  };
});

afterEach(() => { globalThis.fetch = realFetch; db.sqlite.close(); });

test("20 simultaneous approval requests execute the external write once", async () => {
  const approvalId = seedApproval();
  const responses = await Promise.all(Array.from({ length: 20 }, () => assistant(request({ approvalId, decision: "approve" }))));
  assert.equal(responses.filter((response) => response.status === 200).length, 1);
  assert.equal(responses.filter((response) => response.status === 409).length, 19);
  assert.equal(writes, 1); assert.equal(modelCalls, 1);
  assert.equal((await assistant(request({ approvalId, decision: "approve" }))).status, 409);
  assert.equal(writes, 1);
});

test("the direct API denies writes even with a client-supplied approval and permits reads", async () => {
  const approvalId = seedApproval();
  const blocked = await tools(request({ id: "custom", tool: "write_record", arguments: { value: "unapproved" }, approvalId }));
  assert.equal(blocked.status, 403); assert.equal((await blocked.json()).code, "TOOL_APPROVAL_REQUIRED");
  assert.equal(writes, 0);
  assert.equal((await tools(request({ id: "custom", tool: "get_record" }))).status, 200);
});

test("expired, foreign-owner and stale-token approvals never call the provider or tool", async () => {
  const approvalId = seedApproval();
  assert.equal((await assistant(request({ approvalId, decision: "approve" }, "bob@example.test"))).status, 404);
  assert.equal((await assistant(request({ approvalId: "run-1:wrong-token", decision: "approve" }))).status, 409);
  seedApproval({ expires: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await assistant(request({ approvalId, decision: "approve" }))).status, 410);
  assert.equal(writes, 0); assert.equal(modelCalls, 0);
});

test("a rejected approval cannot later be approved", async () => {
  const approvalId = seedApproval();
  assert.equal((await assistant(request({ approvalId, decision: "reject" }))).status, 200);
  assert.equal((await assistant(request({ approvalId, decision: "approve" }))).status, 409);
  assert.equal(writes, 0);
});

test("a previous card cannot approve a subsequent batch in the same run", async () => {
  const approvalId = seedApproval(); nextApproval = true;
  const first = await assistant(request({ approvalId, decision: "approve" }));
  assert.equal(first.status, 202);
  const secondId = (await first.json()).approval.id;
  assert.notEqual(secondId, approvalId);
  assert.equal((await assistant(request({ approvalId, decision: "approve" }))).status, 409);
  assert.equal(writes, 1);
  assert.equal((await assistant(request({ approvalId: secondId, decision: "approve" }))).status, 200);
  assert.equal(writes, 2);
});

test("an interrupted continuation keeps the consumed approval closed", async () => {
  const approvalId = seedApproval(); failModel = true;
  assert.equal((await assistant(request({ approvalId, decision: "approve" }))).status, 500);
  assert.equal(db.sqlite.prepare("SELECT status FROM orchestration_runs WHERE id='run-1'").get().status, "approval_interrupted");
  assert.equal((await assistant(request({ approvalId, decision: "approve" }))).status, 409);
  assert.equal(writes, 1);
});

test("the shared execution boundary binds the approved arguments and owner", async () => {
  seedApproval(); db.sqlite.exec("UPDATE orchestration_runs SET status='approval_executing'");
  const grant = { runId: "run-1", token: "token-1", callId: "call-1" };
  await assert.rejects(callMcpTool(request(), "custom", "write_record", { value: "changed" }, grant), { status: 403 });
  await assert.rejects(callMcpTool(request(), "custom", "write_record", { value: "approved" }, { ...grant, token: "wrong" }), { status: 403 });
  assert.equal(writes, 0);
});

test("local ownership ignores untrusted identity headers; proxy mode requires identity", async () => {
  Object.assign(env, { TERRACOTTA_SELF_HOSTED: "true", TERRACOTTA_TRUST_AUTH_HEADERS: "false" });
  assert.equal(ownerId(request({}, "attacker@example.test")), "owner");
  assert.equal(ownerId(request({}, null)), "owner");
  env.TERRACOTTA_TRUST_AUTH_HEADERS = "true";
  assert.throws(() => ownerId(request({}, null)), { status: 401 });
  assert.equal(ownerId(request({}, "ALICE@example.test")), "alice@example.test");
  assert.equal((await assistant(request({ prompt: "hello" }, null))).status, 401);
  assert.equal((await tools(request({ id: "custom", tool: "get_record" }, null))).status, 401);
  assert.equal(modelCalls, 0);
});
