import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const env = { ...process.env, WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false", WRANGLER_LOG_PATH: ".wrangler/logs" };
for (const [entry, args] of [
  ["wrangler/bin/wrangler.js", ["types", ".wrangler/worker-configuration.d.ts", "--config", "dist/server/wrangler.json"]],
  ["typescript/bin/tsc", ["--noEmit", "--incremental", "false"]],
]) {
  const result = spawnSync(process.execPath, [require.resolve(entry), ...args], { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
}
