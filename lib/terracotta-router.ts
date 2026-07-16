import { env as cloudflareEnv } from "cloudflare:workers";

export type ProviderId = "openai" | "anthropic" | "perplexity" | "higgsfield";
export type ModelPreference = "latest" | "gpt" | "claude";
export type TaskKind = "general" | "research" | "creative";

type RuntimeEnv = {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  PERPLEXITY_API_KEY?: string;
  HIGGSFIELD_MCP_CONNECTED?: string;
  TERRACOTTA_MONTHLY_BUDGET_USD?: string;
};

type RegistryRow = {
  provider: ProviderId;
  model_id: string;
  display_name: string;
  remote_created_at: number;
  version_rank: number;
  is_routable: number;
  input_price_micros: number;
  output_price_micros: number;
  source: string;
};

type Invocation = {
  provider: ProviderId;
  model: string;
  text: string;
  inputUnits: number;
  outputUnits: number;
  actualCostMicros?: number;
  citations?: string[];
};

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS model_registry (key TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL, display_name TEXT NOT NULL, remote_created_at INTEGER DEFAULT 0 NOT NULL, version_rank INTEGER DEFAULT 0 NOT NULL, is_routable INTEGER DEFAULT 0 NOT NULL, input_price_micros INTEGER DEFAULT 0 NOT NULL, output_price_micros INTEGER DEFAULT 0 NOT NULL, source TEXT DEFAULT 'official-seed' NOT NULL, discovered_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, last_seen_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS model_registry_provider_idx ON model_registry (provider, is_routable)`,
  `CREATE TABLE IF NOT EXISTS provider_sync (provider TEXT PRIMARY KEY NOT NULL, status TEXT NOT NULL, current_model TEXT, last_synced_at TEXT, next_sync_at TEXT, error TEXT)`,
  `CREATE TABLE IF NOT EXISTS usage_ledger (id TEXT PRIMARY KEY NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL, task_type TEXT NOT NULL, input_units INTEGER DEFAULT 0 NOT NULL, output_units INTEGER DEFAULT 0 NOT NULL, provider_cost_micros INTEGER DEFAULT 0 NOT NULL, currency TEXT DEFAULT 'USD' NOT NULL, is_live INTEGER DEFAULT 1 NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS usage_ledger_month_idx ON usage_ledger (created_at, provider)`,
  `CREATE TABLE IF NOT EXISTS owner_settings (owner_id TEXT PRIMARY KEY NOT NULL, model_preference TEXT DEFAULT 'latest' NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
];

const seeds = [
  { provider: "openai" as const, model: "gpt-5.6", name: "GPT-5.6 Sol", rank: 560, input: 5_000_000, output: 30_000_000 },
  { provider: "anthropic" as const, model: "claude-fable-5", name: "Claude Fable 5", rank: 510, input: 10_000_000, output: 50_000_000 },
  { provider: "anthropic" as const, model: "claude-sonnet-5", name: "Claude Sonnet 5", rank: 500, input: 3_000_000, output: 15_000_000 },
  { provider: "perplexity" as const, model: "sonar-pro", name: "Perplexity Sonar Pro", rank: 100, input: 3_000_000, output: 15_000_000 },
  { provider: "higgsfield" as const, model: "higgsfield-mcp", name: "Higgsfield MCP", rank: 100, input: 0, output: 0 },
];

function runtimeEnv() {
  return cloudflareEnv as unknown as RuntimeEnv;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown provider error";
  return message.replace(/(sk|pplx|key)-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 240);
}

function rankVersion(id: string) {
  const match = id.match(/(?:gpt-|claude-(?:fable|sonnet|opus)-)(\d+)(?:[.-](\d+))?/i);
  return match ? Number(match[1]) * 100 + Number(match[2] ?? 0) : 0;
}

function isOpenAiFrontier(id: string) {
  return /^gpt-\d+(?:\.\d+)*(?:-(?:sol|terra|luna))?$/i.test(id) && !/(mini|nano|chat|codex|audio|realtime|search|image)/i.test(id);
}

function isClaudeFrontier(id: string) {
  return /^claude-(?:fable|sonnet|opus)-\d/i.test(id) && !/(haiku|instant)/i.test(id);
}

async function ensureDatabase(db: D1Database) {
  await db.batch(schemaStatements.map((statement) => db.prepare(statement)));
  await db.prepare("INSERT OR IGNORE INTO owner_settings (owner_id, model_preference) VALUES ('owner', 'latest')").run();
  for (const seed of seeds) {
    await db.prepare(`INSERT OR IGNORE INTO model_registry (key, provider, model_id, display_name, version_rank, is_routable, input_price_micros, output_price_micros, source) VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'official-seed')`)
      .bind(`${seed.provider}:${seed.model}`, seed.provider, seed.model, seed.name, seed.rank, seed.input, seed.output).run();
    const status = seed.provider === "higgsfield" ? "mcp_auth_required" : "needs_key";
    await db.prepare("INSERT OR IGNORE INTO provider_sync (provider, status, current_model) VALUES (?, ?, ?)").bind(seed.provider, status, seed.model).run();
  }
  await db.prepare("UPDATE provider_sync SET current_model='claude-fable-5', next_sync_at=NULL WHERE provider='anthropic' AND current_model='claude-sonnet-5' AND status='needs_key'").run();
}

async function setSyncState(db: D1Database, provider: ProviderId, status: string, currentModel: string | null, error: string | null) {
  const now = new Date();
  const next = new Date(now.getTime() + SIX_HOURS_MS);
  await db.prepare(`INSERT INTO provider_sync (provider, status, current_model, last_synced_at, next_sync_at, error) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET status=excluded.status, current_model=excluded.current_model, last_synced_at=excluded.last_synced_at, next_sync_at=excluded.next_sync_at, error=excluded.error`)
    .bind(provider, status, currentModel, now.toISOString(), next.toISOString(), error).run();
}

async function upsertLiveModel(db: D1Database, model: Omit<RegistryRow, "is_routable" | "source">) {
  await db.prepare(`INSERT INTO model_registry (key, provider, model_id, display_name, remote_created_at, version_rank, is_routable, input_price_micros, output_price_micros, source, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, 'live-registry', CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET display_name=excluded.display_name, remote_created_at=excluded.remote_created_at, version_rank=excluded.version_rank, is_routable=1, input_price_micros=excluded.input_price_micros, output_price_micros=excluded.output_price_micros, source='live-registry', last_seen_at=CURRENT_TIMESTAMP`)
    .bind(`${model.provider}:${model.model_id}`, model.provider, model.model_id, model.display_name, model.remote_created_at, model.version_rank, model.input_price_micros, model.output_price_micros).run();
}

async function syncOpenAi(db: D1Database, key?: string) {
  if (!key) return setSyncState(db, "openai", "needs_key", "gpt-5.6", null);
  const response = await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`OpenAI model registry returned ${response.status}`);
  const payload = await response.json() as { data?: Array<{ id: string; created?: number }> };
  const candidates = (payload.data ?? []).filter((model) => isOpenAiFrontier(model.id)).sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || rankVersion(b.id) - rankVersion(a.id));
  const current = candidates[0];
  if (!current) throw new Error("OpenAI registry did not return a routable frontier model");
  await db.prepare("UPDATE model_registry SET is_routable=0 WHERE provider='openai'").run();
  const exact = /^(gpt-5\.6|gpt-5\.6-sol)$/i.test(current.id);
  await upsertLiveModel(db, { provider: "openai", model_id: current.id, display_name: current.id, remote_created_at: current.created ?? 0, version_rank: rankVersion(current.id), input_price_micros: exact ? 5_000_000 : 10_000_000, output_price_micros: exact ? 30_000_000 : 60_000_000 });
  await setSyncState(db, "openai", "connected", current.id, null);
}

async function syncAnthropic(db: D1Database, key?: string) {
  if (!key) return setSyncState(db, "anthropic", "needs_key", "claude-fable-5", null);
  const response = await fetch("https://api.anthropic.com/v1/models?limit=1000", { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Anthropic model registry returned ${response.status}`);
  const payload = await response.json() as { data?: Array<{ id: string; display_name?: string; created_at?: string }> };
  const candidates = (payload.data ?? []).filter((model) => isClaudeFrontier(model.id)).sort((a, b) => Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "") || rankVersion(b.id) - rankVersion(a.id));
  const current = candidates[0];
  if (!current) throw new Error("Anthropic registry did not return a routable frontier model");
  await db.prepare("UPDATE model_registry SET is_routable=0 WHERE provider='anthropic'").run();
  const prices = /^claude-fable-5(?:$|-)/i.test(current.id) ? [10_000_000, 50_000_000] : /^claude-opus-4-8(?:$|-)/i.test(current.id) ? [5_000_000, 25_000_000] : /^claude-sonnet-5(?:$|-)/i.test(current.id) ? [3_000_000, 15_000_000] : [10_000_000, 60_000_000];
  await upsertLiveModel(db, { provider: "anthropic", model_id: current.id, display_name: current.display_name ?? current.id, remote_created_at: Math.floor(Date.parse(current.created_at ?? "") / 1000) || 0, version_rank: rankVersion(current.id), input_price_micros: prices[0], output_price_micros: prices[1] });
  await setSyncState(db, "anthropic", "connected", current.id, null);
}

export async function syncProviderRegistry(force = false) {
  const env = runtimeEnv();
  const db = env.DB;
  await ensureDatabase(db);
  const due = await db.prepare("SELECT COUNT(*) AS count FROM provider_sync WHERE next_sync_at IS NULL OR next_sync_at <= ?").bind(new Date().toISOString()).first<{ count: number }>();
  if (!force && Number(due?.count ?? 0) === 0) return;

  const jobs: Array<[ProviderId, () => Promise<void>]> = [
    ["openai", () => syncOpenAi(db, env.OPENAI_API_KEY)],
    ["anthropic", () => syncAnthropic(db, env.ANTHROPIC_API_KEY)],
    ["perplexity", () => setSyncState(db, "perplexity", env.PERPLEXITY_API_KEY ? "connected" : "needs_key", "sonar-pro", null)],
    ["higgsfield", () => setSyncState(db, "higgsfield", env.HIGGSFIELD_MCP_CONNECTED === "true" ? "mcp_connected" : "mcp_auth_required", "higgsfield-mcp", null)],
  ];
  for (const [provider, job] of jobs) {
    try { await job(); } catch (error) { await setSyncState(db, provider, "error", null, safeError(error)); }
  }
}

async function currentModels(db: D1Database) {
  const result = await db.prepare(`SELECT m.provider, m.model_id, m.display_name, m.remote_created_at, m.version_rank, m.is_routable, m.input_price_micros, m.output_price_micros, m.source FROM model_registry m JOIN provider_sync s ON s.provider=m.provider AND s.current_model=m.model_id WHERE m.is_routable=1`).all<RegistryRow>();
  return result.results;
}

function chooseLatestFrontier(models: RegistryRow[]) {
  const openai = models.find((model) => model.provider === "openai");
  const anthropic = models.find((model) => model.provider === "anthropic");
  if (!openai) return anthropic;
  if (!anthropic) return openai;
  if (openai.source === "live-registry" && anthropic.source === "live-registry" && openai.remote_created_at !== anthropic.remote_created_at) {
    return openai.remote_created_at > anthropic.remote_created_at ? openai : anthropic;
  }
  return openai.version_rank >= anthropic.version_rank ? openai : anthropic;
}

function configured(env: RuntimeEnv, provider: ProviderId) {
  if (provider === "openai") return Boolean(env.OPENAI_API_KEY);
  if (provider === "anthropic") return Boolean(env.ANTHROPIC_API_KEY);
  if (provider === "perplexity") return Boolean(env.PERPLEXITY_API_KEY);
  return env.HIGGSFIELD_MCP_CONNECTED === "true";
}

export async function getRegistrySnapshot() {
  const env = runtimeEnv();
  await syncProviderRegistry(false);
  const models = await currentModels(env.DB);
  const states = await env.DB.prepare("SELECT provider, status, current_model, last_synced_at, next_sync_at, error FROM provider_sync ORDER BY provider").all<Record<string, string | null>>();
  const usage = await env.DB.prepare("SELECT COALESCE(SUM(provider_cost_micros),0) AS cost, COUNT(*) AS calls FROM usage_ledger WHERE substr(created_at,1,7)=substr(CURRENT_TIMESTAMP,1,7)").first<{ cost: number; calls: number }>();
  const preference = await env.DB.prepare("SELECT model_preference FROM owner_settings WHERE owner_id='owner'").first<{ model_preference: ModelPreference }>();
  const primary = chooseLatestFrontier(models);
  const budgetUsd = Number(env.TERRACOTTA_MONTHLY_BUDGET_USD ?? 24);
  return {
    syncIntervalHours: 6,
    preference: preference?.model_preference ?? "latest",
    latestPrimary: primary ? { provider: primary.provider, model: primary.display_name, modelId: primary.model_id, source: primary.source } : null,
    models: models.map((model) => ({ provider: model.provider, modelId: model.model_id, name: model.display_name, source: model.source })),
    connections: states.results.map((state) => ({ provider: state.provider, status: state.status, model: state.current_model, lastSyncedAt: state.last_synced_at, nextSyncAt: state.next_sync_at, error: state.error, configured: configured(env, state.provider as ProviderId) })),
    monthlyUsage: { calls: Number(usage?.calls ?? 0), costUsd: Number(usage?.cost ?? 0) / 1_000_000, budgetUsd },
  };
}

export async function savePreference(preference: ModelPreference) {
  const env = runtimeEnv();
  await ensureDatabase(env.DB);
  await env.DB.prepare(`INSERT INTO owner_settings (owner_id, model_preference, updated_at) VALUES ('owner', ?, CURRENT_TIMESTAMP) ON CONFLICT(owner_id) DO UPDATE SET model_preference=excluded.model_preference, updated_at=CURRENT_TIMESTAMP`).bind(preference).run();
}

function classifyTask(prompt: string): TaskKind {
  if (/(영상|릴스|이미지|사진|video|image)/i.test(prompt)) return "creative";
  if (/(찾아|검색|최신|리서치|출처|search|research|today|뉴스)/i.test(prompt)) return "research";
  return "general";
}

function extractOpenAiText(payload: { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }) {
  return payload.output_text ?? payload.output?.flatMap((item) => item.content ?? []).filter((part) => part.type === "output_text").map((part) => part.text ?? "").join("\n") ?? "";
}

async function invokeOpenAi(key: string, model: string, prompt: string): Promise<Invocation> {
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, input: prompt, max_output_tokens: 1200 }), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`OpenAI response failed with ${response.status}`);
  const payload = await response.json() as { output_text?: string; output?: Array<{ content?: Array<{ type?: string; text?: string }> }>; usage?: { input_tokens?: number; output_tokens?: number } };
  return { provider: "openai", model, text: extractOpenAiText(payload), inputUnits: payload.usage?.input_tokens ?? 0, outputUnits: payload.usage?.output_tokens ?? 0 };
}

async function invokeAnthropic(key: string, model: string, prompt: string): Promise<Invocation> {
  const response = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }, body: JSON.stringify({ model, max_tokens: 1200, messages: [{ role: "user", content: prompt }] }), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Anthropic response failed with ${response.status}`);
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
  return { provider: "anthropic", model, text: payload.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n") ?? "", inputUnits: payload.usage?.input_tokens ?? 0, outputUnits: payload.usage?.output_tokens ?? 0 };
}

async function invokePerplexity(key: string, prompt: string): Promise<Invocation> {
  const response = await fetch("https://api.perplexity.ai/v1/sonar", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: "sonar-pro", max_tokens: 1200, messages: [{ role: "user", content: prompt }] }), signal: AbortSignal.timeout(60_000) });
  if (!response.ok) throw new Error(`Perplexity response failed with ${response.status}`);
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: { total_cost?: number } }; citations?: string[] };
  return { provider: "perplexity", model: "sonar-pro", text: payload.choices?.[0]?.message?.content ?? "", inputUnits: payload.usage?.prompt_tokens ?? 0, outputUnits: payload.usage?.completion_tokens ?? 0, actualCostMicros: typeof payload.usage?.cost?.total_cost === "number" ? Math.round(payload.usage.cost.total_cost * 1_000_000) : undefined, citations: payload.citations };
}

async function recordUsage(db: D1Database, invocation: Invocation, task: TaskKind, model: RegistryRow | undefined) {
  const estimated = Math.round((invocation.inputUnits * (model?.input_price_micros ?? 0) + invocation.outputUnits * (model?.output_price_micros ?? 0)) / 1_000_000) + (invocation.provider === "perplexity" ? 10_000 : 0);
  const cost = invocation.actualCostMicros ?? estimated;
  await db.prepare("INSERT INTO usage_ledger (id, provider, model_id, task_type, input_units, output_units, provider_cost_micros, currency, is_live) VALUES (?, ?, ?, ?, ?, ?, ?, 'USD', 1)")
    .bind(crypto.randomUUID(), invocation.provider, invocation.model, task, invocation.inputUnits, invocation.outputUnits, cost).run();
  return cost;
}

export async function runAssistant(prompt: string, preference: ModelPreference) {
  const env = runtimeEnv();
  await syncProviderRegistry(false);
  const task = classifyTask(prompt);
  if (task === "creative") {
    throw Object.assign(new Error("Higgsfield는 공식 MCP 계정 인증 후 비동기 생성으로 연결됩니다."), { code: "HIGGSFIELD_MCP_AUTH_REQUIRED", status: 409 });
  }
  const models = await currentModels(env.DB);
  const latest = chooseLatestFrontier(models);
  const budget = Number(env.TERRACOTTA_MONTHLY_BUDGET_USD ?? 24) * 1_000_000;
  const spent = await env.DB.prepare("SELECT COALESCE(SUM(provider_cost_micros),0) AS cost FROM usage_ledger WHERE substr(created_at,1,7)=substr(CURRENT_TIMESTAMP,1,7)").first<{ cost: number }>();
  if (Number(spent?.cost ?? 0) >= budget) throw Object.assign(new Error("이번 달 공급사 원가 예산에 도달했습니다."), { code: "BUDGET_EXHAUSTED", status: 402 });

  const order: ProviderId[] = task === "research" ? ["perplexity"] : preference === "gpt" ? ["openai", "anthropic"] : preference === "claude" ? ["anthropic", "openai"] : latest?.provider === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];
  const errors: string[] = [];
  for (const provider of order) {
    if (!configured(env, provider)) continue;
    const model = models.find((item) => item.provider === provider);
    try {
      const invocation = provider === "openai" ? await invokeOpenAi(env.OPENAI_API_KEY!, model?.model_id ?? "gpt-5.6", prompt) : provider === "anthropic" ? await invokeAnthropic(env.ANTHROPIC_API_KEY!, model?.model_id ?? "claude-fable-5", prompt) : await invokePerplexity(env.PERPLEXITY_API_KEY!, prompt);
      if (!invocation.text.trim()) throw new Error(`${provider} returned an empty response`);
      const costMicros = await recordUsage(env.DB, invocation, task, model);
      return { text: invocation.text, provider: invocation.provider, model: invocation.model, task, costUsd: costMicros / 1_000_000, citations: invocation.citations ?? [], live: true };
    } catch (error) { errors.push(safeError(error)); }
  }
  if (!order.some((provider) => configured(env, provider))) {
    throw Object.assign(new Error(task === "research" ? "Perplexity API 키가 필요합니다." : "OpenAI 또는 Anthropic API 키가 필요합니다."), { code: "PROVIDER_KEY_REQUIRED", status: 503 });
  }
  throw Object.assign(new Error(errors.join(" · ") || "연결된 모델이 응답하지 않았습니다."), { code: "PROVIDER_ERROR", status: 502 });
}

export function routeError(error: unknown) {
  const typed = error as Error & { code?: string; status?: number };
  return { status: typed.status ?? 500, body: { error: safeError(error), code: typed.code ?? "INTERNAL_ERROR" } };
}
