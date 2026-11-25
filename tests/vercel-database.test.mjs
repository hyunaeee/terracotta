import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { createClient } from "@libsql/client";
import { createVercelDatabase } from "../lib/vercel-database.ts";

test("the Vercel database adapter persists bound statements and rolls back failed batches", async () => {
  const directory = await mkdtemp(".terracotta-db-test-");
  const url = `file:${directory}/workspace.db`;
  let client;

  try {
    client = createClient({ url });
    const db = createVercelDatabase(client);
    await db.prepare("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT NOT NULL)").run();

    const insert = db.prepare("INSERT INTO notes (id, body) VALUES (?, ?)");
    const select = db.prepare("SELECT body FROM notes WHERE id = ?");
    const body = "today's 작업 기록";
    const inserted = await insert.bind(1, body).run();
    assert.equal(inserted.meta.changes, 1);
    assert.equal((await select.bind(1).first()).body, body);
    assert.equal(await select.bind(9).first(), null);

    await assert.rejects(db.batch([
      insert.bind(2, "discard this"),
      insert.bind(1, "duplicate primary key"),
    ]));
    assert.equal(await select.bind(2).first(), null);

    const results = await db.batch([
      insert.bind(2, "keep this"),
      db.prepare("UPDATE notes SET body = ? WHERE id = ?").bind("updated", 1),
    ]);
    assert.deepEqual(results.map((result) => result.meta.changes), [1, 1]);
    const unmatched = await db.prepare("DELETE FROM notes WHERE id = ?").bind(9).run();
    assert.equal(unmatched.meta.changes, 0);

    client.close();
    client = createClient({ url });
    const reopened = createVercelDatabase(client);
    const stored = await reopened.prepare("SELECT id, body FROM notes WHERE id >= ? ORDER BY id").bind(1).all();
    assert.deepEqual(stored.results.map(({ id, body }) => [id, body]), [[1, "updated"], [2, "keep this"]]);
  } finally {
    client?.close();
    await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 75 });
  }
});

test("the registry migrates offline defaults and keeps its last usable model if refresh fails", async t => {
  const hook = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === "#terracotta-runtime") {
        return { url: "data:text/javascript,export const env = {};", shortCircuit: true };
      }
      return nextResolve(specifier, context);
    },
  });
  let router;
  try {
    router = await import("../lib/terracotta-router.ts");
  } finally {
    hook.deregister();
  }
  const client = createClient({ url: "file::memory:" });
  t.after(() => client.close());
  const db = createVercelDatabase(client);
  const env = router.runtimeEnv();
  env.DB = db;
  const current = async () => (await router.currentModels(db)).find(row => row.provider === "openai");
  await router.syncProviderRegistry();
  await db.prepare("UPDATE provider_sync SET current_model='gpt-5.6-sol' WHERE provider='openai'").run();
  await router.syncProviderRegistry();
  assert.equal((await current()).model_id, "gpt-6.2-sol");

  env.OPENAI_API_KEY = "test-key";
  let modelIds = ["gpt-6.2-astra", "gpt-6.2-sol", "gpt-6.2-sol-healthcare", "gpt-6.3-preview"];
  const fetch = t.mock.method(globalThis, "fetch", async url => {
    assert.equal(url, "https://api.openai.com/v1/models");
    return Response.json({ data: modelIds.map(id => ({ id })) });
  });
  await router.syncProviderRegistry(true);
  let model = await current();
  assert.equal(model.source, "live-registry");
  assert.equal(model.model_id, "gpt-6.2-sol");
  assert.deepEqual([model.input_price_micros, model.output_price_micros], [2_000_000, 10_000_000]);

  await db.prepare("UPDATE provider_sync SET next_sync_at=NULL WHERE provider='google'").run();
  await router.syncProviderRegistry();
  assert.equal(fetch.mock.callCount(), 1);

  modelIds = ["gpt-6.2-astra"];
  await db.prepare("CREATE TRIGGER reject_model BEFORE INSERT ON model_registry WHEN NEW.model_id='gpt-6.2-astra' BEGIN SELECT RAISE(ABORT, 'test write failure'); END").run();
  await router.syncProviderRegistry(true);
  assert.equal((await current()).model_id, "gpt-6.2-sol");
  const state = await db.prepare("SELECT status, error FROM provider_sync WHERE provider='openai'").first();
  assert.equal(state.status, "error");
  assert.match(state.error, /test write failure/);
  await db.prepare("DROP TRIGGER reject_model").run();
  await router.syncProviderRegistry(true);
  model = await current();
  assert.equal(model.display_name, "GPT-6.2 Astra");
  assert.deepEqual([model.input_price_micros, model.output_price_micros], [8_000_000, 40_000_000]);

  fetch.mock.mockImplementation(async () => new Response(null, { status: 503 }));
  await router.syncProviderRegistry(true);
  assert.equal((await current()).model_id, "gpt-6.2-astra");

  delete env.OPENAI_API_KEY;
  env.ANTHROPIC_API_KEY = "test-key";
  env.GEMINI_API_KEY = "test-key";
  fetch.mock.mockImplementation(async url => {
    if (url.startsWith("https://api.anthropic.com/")) return Response.json({ data: [{ id: "claude-fable-5-2" }] });
    assert.ok(url.startsWith("https://generativelanguage.googleapis.com/"));
    return Response.json({ models: [
      { name: "models/gemini-4.1-hydrogen-preview", baseModelId: "gemini-4.1-hydrogen" },
      { name: "models/gemini-4.1-pro", supportedGenerationMethods: ["embedContent"] },
      { name: "models/gemini-3.8-flash" },
      { name: "models/gemini-4-carbon" },
      { name: "models/gemini-4-hydrogen", supportedGenerationMethods: ["generateContent"] },
    ] });
  });
  await router.syncProviderRegistry(true);
  const models = await router.currentModels(db);
  const fable = models.find(row => row.provider === "anthropic");
  const hydrogen = models.find(row => row.provider === "google");
  assert.deepEqual([fable.model_id, fable.source, fable.input_price_micros, fable.output_price_micros], ["claude-fable-5-2", "live-registry", 8_000_000, 40_000_000]);
  assert.deepEqual([hydrogen.model_id, hydrogen.source, hydrogen.input_price_micros, hydrogen.output_price_micros], ["gemini-4-hydrogen", "live-registry", 1_500_000, 7_500_000]);
});
