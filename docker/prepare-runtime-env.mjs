import { randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const runtimeEnvPath = process.argv[2] ?? "/tmp/terracotta-runtime.env";
const dataDir = process.argv[3] ?? process.env.TERRACOTTA_DATA_DIR ?? "/data";
const secretsDir = path.join(dataDir, "secrets");
const encryptionKeyPath = path.join(secretsDir, "mcp-token-encryption-key");

await mkdir(secretsDir, { recursive: true, mode: 0o700 });
await chmod(secretsDir, 0o700);

function validateEncryptionKey(value) {
  const normalized = value.trim();
  const decoded = Buffer.from(normalized, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== normalized) {
    throw new Error(
      "MCP_TOKEN_ENCRYPTION_KEY must be exactly 32 random bytes encoded as base64.",
    );
  }
  return normalized;
}

async function resolveEncryptionKey() {
  const provided = process.env.MCP_TOKEN_ENCRYPTION_KEY?.trim();
  if (provided) {
    const key = validateEncryptionKey(provided);
    await writeFile(encryptionKeyPath, `${key}\n`, { mode: 0o600 });
    return key;
  }

  try {
    return validateEncryptionKey(await readFile(encryptionKeyPath, "utf8"));
  } catch (error) {
    const isMissing =
      error && typeof error === "object" && "code" in error && error.code === "ENOENT";
    if (!isMissing) {
      throw error;
    }
  }

  const key = randomBytes(32).toString("base64");
  await writeFile(encryptionKeyPath, `${key}\n`, { mode: 0o600 });
  return key;
}

const values = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "",
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? "",
  PERPLEXITY_API_KEY: process.env.PERPLEXITY_API_KEY ?? "",
  HIGGSFIELD_MCP_CONNECTED: process.env.HIGGSFIELD_MCP_CONNECTED ?? "false",
  TERRACOTTA_MONTHLY_BUDGET_USD:
    process.env.TERRACOTTA_MONTHLY_BUDGET_USD ?? "24",
  TERRACOTTA_SELF_HOSTED: "true",
  MCP_TOKEN_ENCRYPTION_KEY: await resolveEncryptionKey(),
};

const serialized = Object.entries(values)
  .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
  .join("\n");

await writeFile(runtimeEnvPath, `${serialized}\n`, { mode: 0o600 });
await chmod(runtimeEnvPath, 0o600);

console.log(`Terracotta self-host runtime is ready. Persistent data: ${dataDir}`);
