import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = new URL("../", import.meta.url);
const runtimeScript = fileURLToPath(
  new URL("../docker/prepare-runtime-env.mjs", import.meta.url),
);

function runRuntimeSetup(runtimeFile, dataDir, env = {}) {
  return spawnSync(process.execPath, [runtimeScript, runtimeFile, dataDir], {
    cwd: root,
    env: { ...process.env, MCP_TOKEN_ENCRYPTION_KEY: "", ...env },
    encoding: "utf8",
  });
}

test("self-hosting generates and reuses a persistent MCP encryption key", async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "terracotta-selfhost-"));
  const runtimeFile = path.join(sandbox, "runtime.env");

  try {
    const first = runRuntimeSetup(runtimeFile, sandbox);
    assert.equal(first.status, 0, first.stderr);

    const firstRuntime = await readFile(runtimeFile, "utf8");
    const firstKey = await readFile(
      path.join(sandbox, "secrets", "mcp-token-encryption-key"),
      "utf8",
    );
    assert.match(firstRuntime, /TERRACOTTA_SELF_HOSTED="true"/);
    assert.equal(Buffer.from(firstKey.trim(), "base64").length, 32);

    const second = runRuntimeSetup(runtimeFile, sandbox);
    assert.equal(second.status, 0, second.stderr);
    const secondKey = await readFile(
      path.join(sandbox, "secrets", "mcp-token-encryption-key"),
      "utf8",
    );
    assert.equal(secondKey, firstKey);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("self-hosting rejects an invalid user-supplied encryption key", async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "terracotta-selfhost-"));

  try {
    const result = runRuntimeSetup(path.join(sandbox, "runtime.env"), sandbox, {
      MCP_TOKEN_ENCRYPTION_KEY: "not-a-32-byte-base64-key",
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly 32 random bytes/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});

test("self-hosting fails closed when the persisted encryption key is corrupt", async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), "terracotta-selfhost-"));
  const secretsDir = path.join(sandbox, "secrets");

  try {
    await mkdir(secretsDir, { recursive: true });
    await writeFile(path.join(secretsDir, "mcp-token-encryption-key"), "corrupt\n");
    const result = runRuntimeSetup(path.join(sandbox, "runtime.env"), sandbox);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exactly 32 random bytes/);
  } finally {
    await rm(sandbox, { recursive: true, force: true });
  }
});
