import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
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
