import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer, get as getHTTP } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { generateKeyPair, SignJWT } from "jose";
import { createLocalChatGPT } from "../scripts/local-chatgpt.mjs";

const prefix = "/api/local-chatgpt/";
const issuer = "https://auth.openai.com";
const resource = "https://api.openai.com/v1";
const issued = "oaiapp_test";
const sha = value => createHash("sha256").update(value).digest("base64url");
const keys = await generateKeyPair("RS256");

async function fixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), "terracotta-local-chatgpt-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const record = { refreshes: 0, inputs: [], revokes: [], tokenCount: 0, ttl: 3600, subject: "user-1234" };
  async function mockProvider(url, { body, headers, redirect }) {
    assert.equal(redirect, "error");
    if (url === issuer + "/api/accounts/oauth/token") {
      assert.equal(body.get("resource"), resource);
      assert.equal(body.get("client_id"), issued);
      if (body.get("grant_type") === "refresh_token") {
        record.refreshes++;
        assert.equal(body.get("refresh_token"), "refresh-initial");
        if (record.rejectRefresh) return Response.json({ error: "invalid_grant" }, { status: 400 });
        return Response.json({ access_token: "access-renewed", refresh_token: "refresh-renewed", token_type: "Bearer", expires_in: 3600 });
      }
      assert.equal(body.get("grant_type"), "authorization_code");
      assert.equal(body.get("redirect_uri"), record.attempt.get("redirect_uri"));
      assert.equal(sha(body.get("code_verifier")), record.attempt.get("code_challenge"));
      record.tokenCount++;
      const id = await new SignJWT({ nonce: record.badNonce ? "different" : record.attempt.get("nonce"), email: "local@example.test" })
        .setProtectedHeader({ alg: "RS256" }).setIssuer(issuer).setSubject(record.subject).setAudience(issued).setExpirationTime("5m").sign(keys.privateKey);
      return Response.json({ id_token: id, access_token: "access-initial", refresh_token: "refresh-initial", expires_in: record.ttl,
        token_type: "Bearer", scope: record.noScope ? "openid" : record.attempt.get("scope") });
    }
    if (url === issuer + "/api/accounts/oauth/revoke") {
      record.revokes.push(body.get("token"));
      return new Response(null, { status: 204 });
    }
    assert.match(headers.Authorization, /^Bearer access-(initial|renewed)$/);
    if (url === resource + "/models") return Response.json({ models: [
      { slug: "account-model", display_name: "Account model", visibility: "list" },
      { slug: "hidden", visibility: "hidden" },
    ] });
    assert.equal(url, resource + "/responses");
    record.inputs.push(JSON.parse(body));
    const events = [
      { type: "response.output_text.delta", delta: "반가워요 🌱" },
      record.streamFailure ? { type: "response.failed", response: { error: { code: "subscription_sharing_usage_limit_exceeded" } } } : { type: "response.completed" },
    ].map(e => "data: " + JSON.stringify(e) + "\r\n\r\n").join("");
    const bytes = new TextEncoder().encode(events);
    return new Response(new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(Uint8Array.of(byte)); c.close(); } }));
  }
  const makeMiddleware = () => createLocalChatGPT({ dir, http: mockProvider, keys: keys.publicKey });
  let middleware = makeMiddleware();
  const srv = createServer((req, res) => middleware(req, res, () => {
    const key = "x-terracotta-local-subscriptions";
    res.end(JSON.stringify({ mode: req.headers[key] ?? null, raw: req.rawHeaders.includes(key) }));
  }));
  await new Promise(resolve => srv.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise(resolve => srv.close(resolve)));
  const origin = "http://127.0.0.1:" + srv.address().port;
  function browser() {
    const jar = new Map();
    async function request(route, options = {}) {
      const response = await fetch(origin + route, { ...options, redirect: "manual", headers: { Cookie: Array.from(jar.values()).join("; "), ...options.headers } });
      for (const header of response.headers.getSetCookie()) {
        const cookie = header.split(";")[0];
        jar.set(cookie.split("=")[0], cookie);
      }
      return response;
    }
    const post = (route, input = {}) => request(prefix + route, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(input) });
    async function start() {
      const response = await post("sign-in");
      assert.equal(response.status, 200);
      const auth = new URL((await response.json()).url);
      assert.equal(auth.origin + auth.pathname, issuer + "/api/accounts/authorize");
      assert.equal(auth.searchParams.get("redirect_uri"), origin + prefix + "callback");
      assert.equal(auth.searchParams.get("code_challenge_method"), "S256");
      assert.equal(auth.searchParams.get("resource"), resource);
      record.attempt = auth.searchParams;
      return auth.searchParams;
    }
    async function callback(extra = {}) {
      return request(prefix + "callback?" + new URLSearchParams({ code: "mock-code", client_id: issued, state: record.attempt.get("state"), ...extra }));
    }
    return { request, post, start, callback, enter: () => request("/?subscriptions=1"), status: () => request(prefix + "status").then(r => r.json()) };
  }
  return { dir, origin, record, browser, restart: () => { middleware = makeMiddleware(); } };
}

test("direct loopback entry exclusively grants a private browser session and strips spoofed mode headers", async t => {
  const { browser, origin } = await fixture(t);
  const b = browser();
  assert.equal((await b.request(prefix + "status")).status, 401);
  const entry = await b.enter();
  assert.deepEqual(await entry.json(), { mode: "1", raw: true });
  for (const cookie of entry.headers.getSetCookie()) assert.match(cookie, /HttpOnly; SameSite=Lax/);
  assert.deepEqual(await b.status(), { connected: false });
  for (const headers of [{ Origin: "https://outside.test" }, { "X-Forwarded-Host": "127.0.0.1" }]) {
    assert.equal((await b.request(prefix + "status", { headers })).status, 403);
  }
  // fetch overrides Host, so exercise DNS-rebinding protection at the HTTP layer.
  const rebinding = await new Promise((resolve, reject) => {
    getHTTP(origin + prefix + "status", { headers: { Host: "outside.test" } }, r => { r.resume(); resolve(r.statusCode); }).once("error", reject);
  });
  assert.equal(rebinding, 403);
  assert.equal((await b.request(prefix + "sign-in", { method: "POST" })).status, 403);
  assert.equal((await b.post("chat", { turns: [] })).status, 401);
  const normal = await b.request("/", { headers: { "X-Terracotta-Local-Subscriptions": "1" } });
  assert.deepEqual(await normal.json(), { mode: null, raw: false });
});

test("verified PKCE login, per-account models, streamed Korean response, logout and restart", async t => {
  const f = await fixture(t);
  const b = f.browser(), other = f.browser();
  await Promise.all([b.enter(), other.enter()]);
  const initial = await b.start();
  assert.equal(initial.get("client_id"), "dynamic_agent_client");
  assert.equal(initial.get("agent_name_hint"), "Terracotta");
  assert.match(initial.get("ext_agent_host_id"), /^urn:uuid:/);
  assert.equal((await b.callback()).headers.get("location"), "/?subscriptions=1");
  assert.deepEqual(await other.status(), { connected: false });
  assert.deepEqual(await b.status(), { connected: true, email: "local@example.test", models: [{ id: "account-model", name: "Account model" }] });
  const turns = [{ role: "user", text: "안녕하세요" }];
  assert.equal((await b.post("chat", { model: "hidden", turns })).status, 400);
  assert.deepEqual(await (await b.post("chat", { model: "account-model", turns, tools: ["injected"] })).json(), { model: "account-model", text: "반가워요 🌱" });
  assert.deepEqual(f.record.inputs, [{ model: "account-model", store: false, stream: true, input: [{ role: "user", content: "안녕하세요" }] }]);
  f.record.streamFailure = true;
  assert.equal((await b.post("chat", { model: "account-model", turns })).status, 429);
  const saved = await Promise.all((await readdir(f.dir)).map(name => readFile(path.join(f.dir, name), "utf8")));
  assert.doesNotMatch(saved.join(""), /access-initial|refresh-initial|local@example|user-1234/);
  assert.deepEqual(await (await b.post("sign-out")).json(), { connected: false });
  assert.deepEqual(f.record.revokes, ["refresh-initial"]);
  assert.deepEqual(await b.status(), { connected: false });
  assert.equal((await b.start()).get("client_id"), issued);
  f.restart();
  await b.enter();
  const returning = await b.start();
  assert.equal(returning.get("client_id"), issued);
  assert.equal(returning.get("ext_agent_host_id"), initial.get("ext_agent_host_id"));
  assert.equal(returning.has("agent_name_hint"), false);
  f.record.subject = "different-user";
  assert.match((await b.callback()).headers.get("location"), /subscription-error=/);
  assert.deepEqual(await b.status(), { connected: false });
});

test("rejects wrong state, bad nonce and missing direct plan grant, coalesces token refresh", async t => {
  const f = await fixture(t);
  const b = f.browser();
  await b.enter();
  await b.start();
  assert.match((await b.callback({ state: "wrong" })).headers.get("location"), /subscription-error=/);
  assert.equal(f.record.tokenCount, 0);
  f.record.badNonce = true;
  assert.match((await b.callback()).headers.get("location"), /subscription-error=/);
  f.record.badNonce = false; f.record.noScope = true;
  await b.start();
  assert.match((await b.callback()).headers.get("location"), /subscription-error=/);
  assert.deepEqual(await b.status(), { connected: false });
  f.record.noScope = false; f.record.ttl = 10;
  await b.start();
  assert.equal((await b.callback()).headers.get("location"), "/?subscriptions=1");
  assert.ok((await Promise.all([b.status(), b.status()])).every(s => s.connected));
  assert.equal(f.record.refreshes, 1);
  await b.post("sign-out");
  assert.deepEqual(f.record.revokes, ["refresh-renewed"]);
});

test("terminal refresh invalidates credentials and keeps the account registration for immediate reauthorization", async t => {
  const f = await fixture(t);
  const b = f.browser();
  await b.enter();
  f.record.ttl = 5;
  f.record.rejectRefresh = true;
  await b.start();
  await b.callback();
  assert.equal((await b.status()).connected, false);
  assert.deepEqual(await b.status(), { connected: false });
  assert.equal(f.record.refreshes, 1);
  assert.equal((await b.start()).get("client_id"), issued);
});
