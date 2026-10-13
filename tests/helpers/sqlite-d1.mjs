import { DatabaseSync } from "node:sqlite";

// Execute production SQL on SQLite, with D1's async query/result shape. This
// tests SQL claims and route behavior; it is not a Cloudflare deployment test.
export function sqliteD1() {
  const sqlite = new DatabaseSync(":memory:");
  const prepare = (sql, parameters = []) => ({
    bind(...values) { return prepare(sql, values); },
    async first() { return sqlite.prepare(sql).get(...parameters) ?? null; },
    async all() { return { results: sqlite.prepare(sql).all(...parameters) }; },
    execute() { const result = sqlite.prepare(sql).run(...parameters); return { success: true, meta: { changes: Number(result.changes) } }; },
    async run() { return this.execute(); },
  });
  return {
    sqlite, prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try { const results = statements.map((statement) => statement.execute()); sqlite.exec("COMMIT"); return results; }
      catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
}
