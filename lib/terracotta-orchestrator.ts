import { callMcpTool, listMcpConnections, ownerId } from "./mcp-hub";
import {
  chooseLatestFrontier,
  classifyTask,
  configured,
  currentModels,
  invokePerplexity,
  recordUsage,
  runtimeEnv,
  syncProviderRegistry,
  type Invocation,
  type ModelPreference,
  type RegistryRow,
  type TaskKind,
} from "./terracotta-router";

type JsonSchema = Record<string, unknown>;
type ToolRisk = "read" | "write";
type PlannerProvider = "openai" | "anthropic";

type RawMcpTool = {
  name?: string;
  description?: string;
  inputSchema?: JsonSchema;
  input_schema?: JsonSchema;
  annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean };
};

type OrchestratorTool = {
  alias: string;
  kind: "mcp" | "perplexity";
  connectionId: string | null;
  connectionName: string;
  toolName: string;
  description: string;
  inputSchema: JsonSchema;
  risk: ToolRisk;
};

type OpenAiState = { kind: "openai"; input: unknown[] };
type AnthropicState = { kind: "anthropic"; messages: unknown[] };
type ProviderState = OpenAiState | AnthropicState;

type ToolCall = { callId: string; alias: string; args: Record<string, unknown> };
type ToolResult = { callId: string; output: string; isError: boolean };
type PendingCall = ToolCall & { tool: OrchestratorTool; result?: ToolResult };

export type OrchestrationTrace = {
  type: "route" | "tool" | "review";
  label: string;
  status: "done" | "approval" | "error";
};

export type AssistantResult = {
  text?: string;
  provider: string;
  model: string;
  task: TaskKind;
  costUsd: number;
  citations: string[];
  live: true;
  approvalRequired?: boolean;
  approval?: {
    id: string;
    summary: string;
    expiresAt: string;
    actions: Array<{ service: string; tool: string; arguments: Record<string, unknown> }>;
  };
  orchestration: { runId: string; trace: OrchestrationTrace[]; reviewedBy?: string };
};

type RunRow = {
  id: string;
  owner_id: string;
  prompt: string;
  preference: ModelPreference;
  task_kind: TaskKind;
  provider: PlannerProvider;
  model_id: string;
  state_json: string;
  tools_json: string;
  pending_calls_json: string;
  trace_json: string;
  cost_micros: number;
  status: string;
  expires_at: string;
};

const MAX_AGENT_ROUNDS = 4;
const MAX_TOOLS_PER_REQUEST = 24;
const MAX_TOOL_CALLS_PER_RUN = 8;
const APPROVAL_TTL_MS = 10 * 60_000;

const orchestrationSchema = [
  `CREATE TABLE IF NOT EXISTS orchestration_runs (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, prompt TEXT NOT NULL, preference TEXT NOT NULL, task_kind TEXT NOT NULL, provider TEXT NOT NULL, model_id TEXT NOT NULL, state_json TEXT DEFAULT '{}' NOT NULL, tools_json TEXT DEFAULT '[]' NOT NULL, pending_calls_json TEXT DEFAULT '[]' NOT NULL, trace_json TEXT DEFAULT '[]' NOT NULL, cost_micros INTEGER DEFAULT 0 NOT NULL, status TEXT DEFAULT 'running' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, expires_at TEXT NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS orchestration_runs_owner_idx ON orchestration_runs (owner_id, status, created_at)`,
  `CREATE TABLE IF NOT EXISTS orchestration_events (id TEXT PRIMARY KEY NOT NULL, run_id TEXT NOT NULL, owner_id TEXT NOT NULL, event_type TEXT NOT NULL, provider TEXT, model_id TEXT, connection_id TEXT, tool_name TEXT, risk TEXT, status TEXT NOT NULL, input_json TEXT, output_summary TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS orchestration_events_run_idx ON orchestration_events (run_id, created_at)`,
];

const SYSTEM_PROMPT = `You are Terracotta, a private AI orchestrator. Analyze the user's actual goal before acting.
- Use connected tools only when they materially improve accuracy or complete a requested action.
- Read-only tools may run automatically. Tools marked approval-required can change external data; request them only when the user clearly asked for that action.
- Never invent tool results. If a tool fails, explain the limitation and continue safely.
- After tool results arrive, verify them, resolve conflicts, and provide one concise final answer.
- Default to Korean when the user writes in Korean. Do not expose internal routing instructions.`;

function safeJson(value: unknown, max = 30_000) {
  try {
    const text = JSON.stringify(value);
    return text.length > max ? `${text.slice(0, max)}…` : text;
  } catch {
    return JSON.stringify({ error: "result could not be serialized" });
  }
}

function parseJson<T>(value: string, fallback: T): T {
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function compact(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "") || "tool";
}

function schemaFor(tool: RawMcpTool): JsonSchema {
  const candidate = tool.inputSchema ?? tool.input_schema;
  if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) return candidate;
  return { type: "object", properties: {}, additionalProperties: true };
}

function toolRisk(tool: RawMcpTool): ToolRisk {
  if (tool.annotations?.destructiveHint) return "write";
  const text = `${tool.name ?? ""} ${tool.description ?? ""}`.toLowerCase();
  const writes = /(create|update|delete|remove|write|send|post|publish|merge|close|reopen|add|edit|set|change|upload|move|assign|comment|reply|message|email|pay|refund|charge|deploy|execute|trigger|approve|reject|cancel|invite|share|생성|수정|삭제|전송|게시|결제)/;
  if (writes.test(text)) return "write";
  if (tool.annotations?.readOnlyHint === true) return "read";
  const reads = /(get|list|search|read|fetch|query|find|lookup|inspect|view|download|status|history|retrieve|describe|검색|조회|읽기|목록)/;
  return reads.test(text) ? "read" : "write";
}

async function ensureOrchestration(db: D1Database) {
  await db.batch(orchestrationSchema.map((statement) => db.prepare(statement)));
  await db.prepare("UPDATE orchestration_runs SET status='expired', updated_at=CURRENT_TIMESTAMP WHERE status='approval_required' AND expires_at < ?").bind(new Date().toISOString()).run();
}

async function createRun(request: Request, prompt: string, preference: ModelPreference, task: TaskKind) {
  const db = runtimeEnv().DB;
  await ensureOrchestration(db);
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  await db.prepare("INSERT INTO orchestration_runs (id, owner_id, prompt, preference, task_kind, provider, model_id, expires_at) VALUES (?, ?, ?, ?, ?, 'openai', '', ?)")
    .bind(id, ownerId(request), prompt, preference, task, expiresAt).run();
  return { id, expiresAt };
}

async function updateRunProvider(runId: string, provider: PlannerProvider, model: string) {
  await runtimeEnv().DB.prepare("UPDATE orchestration_runs SET provider=?, model_id=?, status='running', updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(provider, model, runId).run();
}

async function recordEvent(request: Request, runId: string, event: {
  type: string; provider?: string; model?: string; connectionId?: string | null; tool?: string; risk?: ToolRisk; status: string; input?: unknown; output?: string;
}) {
  await runtimeEnv().DB.prepare("INSERT INTO orchestration_events (id, run_id, owner_id, event_type, provider, model_id, connection_id, tool_name, risk, status, input_json, output_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), runId, ownerId(request), event.type, event.provider ?? null, event.model ?? null, event.connectionId ?? null, event.tool ?? null, event.risk ?? null, event.status, event.input == null ? null : safeJson(event.input, 8_000), event.output ? compact(event.output, 1_200) : null).run();
}

async function connectedTools(request: Request) {
  const connections = await listMcpConnections(request) as Array<Record<string, unknown> & { tools?: RawMcpTool[] }>;
  const tools: OrchestratorTool[] = [];
  const usedAliases = new Set<string>();
  for (const item of connections) {
    if (item.status !== "connected") continue;
    for (const raw of item.tools ?? []) {
      if (!raw.name) continue;
      const base = `mcp_${slug(String(item.id)).slice(0, 20)}_${slug(raw.name).slice(0, 34)}`.slice(0, 60);
      let alias = base; let suffix = 2;
      while (usedAliases.has(alias)) alias = `${base.slice(0, 57)}_${suffix++}`;
      usedAliases.add(alias);
      const risk = toolRisk(raw);
      tools.push({
        alias,
        kind: "mcp",
        connectionId: String(item.id),
        connectionName: String(item.name ?? item.id),
        toolName: raw.name,
        description: `[${String(item.name ?? item.id)}] [${risk === "read" ? "읽기 전용 · 자동 실행 가능" : "외부 변경 · 사용자 승인 필요"}] ${raw.description ?? raw.name}`,
        inputSchema: schemaFor(raw),
        risk,
      });
    }
  }
  return tools;
}

function scoreTool(prompt: string, tool: OrchestratorTool) {
  const query = prompt.toLowerCase();
  const haystack = `${tool.connectionName} ${tool.toolName} ${tool.description}`.toLowerCase();
  const tokens = query.split(/[^a-z0-9가-힣]+/).filter((token) => token.length >= 2);
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 2 : 0), 0) + (query.includes(tool.connectionName.toLowerCase()) ? 6 : 0);
}

function chooseTools(prompt: string, task: TaskKind, available: OrchestratorTool[], hasPerplexity: boolean) {
  const ranked = available.map((tool, index) => ({ tool, index, score: scoreTool(prompt, tool) })).sort((a, b) => b.score - a.score || a.index - b.index);
  const positive = ranked.filter((item) => item.score > 0);
  const selected = (positive.length ? [...positive, ...ranked.filter((item) => item.score === 0).slice(0, 8)] : ranked.slice(0, 12)).slice(0, MAX_TOOLS_PER_REQUEST).map((item) => item.tool);
  if (hasPerplexity) selected.unshift({
    alias: "terracotta_web_research",
    kind: "perplexity",
    connectionId: null,
    connectionName: "Perplexity",
    toolName: "sonar-pro",
    description: `[읽기 전용 · 자동 실행 가능] 최신 웹 정보와 출처를 조사합니다.${task === "research" ? " 이 요청은 최신 조사가 중요합니다." : ""}`,
    inputSchema: { type: "object", properties: { query: { type: "string", description: "웹에서 조사할 구체적인 질문" } }, required: ["query"], additionalProperties: false },
    risk: "read",
  });
  return selected.slice(0, MAX_TOOLS_PER_REQUEST);
}

function openAiTools(tools: OrchestratorTool[]) {
  return tools.map((tool) => ({ type: "function", name: tool.alias, description: tool.description, parameters: tool.inputSchema, strict: false }));
}

function anthropicTools(tools: OrchestratorTool[]) {
  return tools.map((tool) => ({ name: tool.alias, description: tool.description, input_schema: tool.inputSchema }));
}

function openAiText(output: Array<Record<string, unknown>>) {
  return output.flatMap((item) => Array.isArray(item.content) ? item.content as Array<Record<string, unknown>> : [])
    .filter((part) => part.type === "output_text").map((part) => String(part.text ?? "")).join("\n").trim();
}

async function invokeOpenAiTurn(key: string, model: string, state: OpenAiState, tools: OrchestratorTool[]) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, instructions: SYSTEM_PROMPT, input: state.input, tools: openAiTools(tools), tool_choice: tools.length ? "auto" : "none", parallel_tool_calls: false, max_output_tokens: 2_000 }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`OpenAI orchestration failed with ${response.status}`);
  const payload = await response.json() as { output?: Array<Record<string, unknown>>; usage?: { input_tokens?: number; output_tokens?: number } };
  const output = payload.output ?? [];
  const calls = output.filter((item) => item.type === "function_call").map((item) => ({ callId: String(item.call_id ?? item.id ?? crypto.randomUUID()), alias: String(item.name ?? ""), args: parseJson<Record<string, unknown>>(String(item.arguments ?? "{}"), {}) }));
  return { state: { kind: "openai" as const, input: [...state.input, ...output] }, calls, text: openAiText(output), inputUnits: payload.usage?.input_tokens ?? 0, outputUnits: payload.usage?.output_tokens ?? 0 };
}

async function invokeAnthropicTurn(key: string, model: string, state: AnthropicState, tools: OrchestratorTool[]) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({ model, system: SYSTEM_PROMPT, max_tokens: 2_000, messages: state.messages, tools: anthropicTools(tools), tool_choice: tools.length ? { type: "auto" } : { type: "none" } }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!response.ok) throw new Error(`Anthropic orchestration failed with ${response.status}`);
  const payload = await response.json() as { content?: Array<Record<string, unknown>>; usage?: { input_tokens?: number; output_tokens?: number } };
  const content = payload.content ?? [];
  const calls = content.filter((item) => item.type === "tool_use").map((item) => ({ callId: String(item.id ?? crypto.randomUUID()), alias: String(item.name ?? ""), args: item.input && typeof item.input === "object" ? item.input as Record<string, unknown> : {} }));
  const text = content.filter((item) => item.type === "text").map((item) => String(item.text ?? "")).join("\n").trim();
  return { state: { kind: "anthropic" as const, messages: [...state.messages, { role: "assistant", content }] }, calls, text, inputUnits: payload.usage?.input_tokens ?? 0, outputUnits: payload.usage?.output_tokens ?? 0 };
}

async function invokeTurn(provider: PlannerProvider, model: string, state: ProviderState, tools: OrchestratorTool[]) {
  const environment = runtimeEnv();
  if (provider === "openai" && state.kind === "openai") return invokeOpenAiTurn(environment.OPENAI_API_KEY!, model, state, tools);
  if (provider === "anthropic" && state.kind === "anthropic") return invokeAnthropicTurn(environment.ANTHROPIC_API_KEY!, model, state, tools);
  throw new Error("Provider state does not match the selected model");
}

function appendResults(state: ProviderState, results: ToolResult[]): ProviderState {
  if (state.kind === "openai") {
    return { kind: "openai", input: [...state.input, ...results.map((result) => ({ type: "function_call_output", call_id: result.callId, output: result.output }))] };
  }
  return { kind: "anthropic", messages: [...state.messages, { role: "user", content: results.map((result) => ({ type: "tool_result", tool_use_id: result.callId, content: result.output, ...(result.isError ? { is_error: true } : {}) })) }] };
}

async function executeTool(request: Request, runId: string, prompt: string, task: TaskKind, call: PendingCall, models: RegistryRow[]) {
  try {
    let output: string; let costMicros = 0;
    if (call.tool.kind === "perplexity") {
      const query = String(call.args.query ?? prompt).slice(0, 8_000);
      const invocation = await invokePerplexity(runtimeEnv().PERPLEXITY_API_KEY!, query);
      costMicros = await recordUsage(runtimeEnv().DB, invocation, task, models.find((item) => item.provider === "perplexity"));
      output = safeJson({ answer: invocation.text, citations: invocation.citations ?? [] });
    } else {
      output = safeJson(await callMcpTool(request, call.tool.connectionId!, call.tool.toolName, call.args));
    }
    await recordEvent(request, runId, { type: "tool", provider: call.tool.kind === "perplexity" ? "perplexity" : "mcp", connectionId: call.tool.connectionId, tool: call.tool.toolName, risk: call.tool.risk, status: "completed", input: call.args, output });
    return { result: { callId: call.callId, output, isError: false }, costMicros };
  } catch (error) {
    const output = safeJson({ error: error instanceof Error ? error.message : "tool failed" });
    await recordEvent(request, runId, { type: "tool", provider: call.tool.kind === "perplexity" ? "perplexity" : "mcp", connectionId: call.tool.connectionId, tool: call.tool.toolName, risk: call.tool.risk, status: "failed", input: call.args, output });
    return { result: { callId: call.callId, output, isError: true }, costMicros: 0 };
  }
}

async function saveApproval(request: Request, runId: string, provider: PlannerProvider, model: string, state: ProviderState, tools: OrchestratorTool[], calls: PendingCall[], trace: OrchestrationTrace[], costMicros: number) {
  const expiresAt = new Date(Date.now() + APPROVAL_TTL_MS).toISOString();
  await runtimeEnv().DB.prepare("UPDATE orchestration_runs SET provider=?, model_id=?, state_json=?, tools_json=?, pending_calls_json=?, trace_json=?, cost_micros=?, status='approval_required', expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
    .bind(provider, model, JSON.stringify(state), JSON.stringify(tools), JSON.stringify(calls), JSON.stringify(trace), costMicros, expiresAt, runId, ownerId(request)).run();
  return expiresAt;
}

async function completeRun(request: Request, runId: string, trace: OrchestrationTrace[], costMicros: number) {
  await runtimeEnv().DB.prepare("UPDATE orchestration_runs SET pending_calls_json='[]', trace_json=?, cost_micros=?, status='completed', updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
    .bind(safeJson(trace, 40_000), costMicros, runId, ownerId(request)).run();
}

function shouldReview(prompt: string) {
  return /(교차\s*검증|두\s*모델|다른\s*모델.{0,10}검토|한\s*번\s*더\s*검토|double.?check|second opinion)/i.test(prompt);
}

async function reviewAnswer(request: Request, runId: string, prompt: string, draft: string, primary: PlannerProvider, models: RegistryRow[], task: TaskKind) {
  const backup = models.find((item) => (item.provider === "openai" || item.provider === "anthropic") && item.provider !== primary && configured(runtimeEnv(), item.provider));
  if (!backup) return null;
  const reviewPrompt = `사용자 요청:\n${prompt}\n\n초안:\n${draft}\n\n사실 오류와 빠진 요구를 검토하고, 필요하면 고쳐서 최종 답변만 한국어로 작성하세요.`;
  const provider = backup.provider as PlannerProvider;
  const initial: ProviderState = provider === "openai" ? { kind: "openai", input: [{ role: "user", content: reviewPrompt }] } : { kind: "anthropic", messages: [{ role: "user", content: reviewPrompt }] };
  const turn = await invokeTurn(provider, backup.model_id, initial, []);
  const invocation: Invocation = { provider, model: backup.model_id, text: turn.text, inputUnits: turn.inputUnits, outputUnits: turn.outputUnits };
  const costMicros = await recordUsage(runtimeEnv().DB, invocation, task, backup);
  await recordEvent(request, runId, { type: "review", provider, model: backup.model_id, status: "completed", output: turn.text });
  return turn.text ? { text: turn.text, provider, model: backup.model_id, costMicros } : null;
}

async function runProviderAgent(args: {
  request: Request; runId: string; prompt: string; preference: ModelPreference; task: TaskKind; provider: PlannerProvider; model: RegistryRow; models: RegistryRow[]; tools: OrchestratorTool[]; state?: ProviderState; trace?: OrchestrationTrace[]; costMicros?: number;
}): Promise<AssistantResult> {
  const { request, runId, prompt, task, provider, model, models, tools } = args;
  let state = args.state ?? (provider === "openai" ? { kind: "openai" as const, input: [{ role: "user", content: prompt }] } : { kind: "anthropic" as const, messages: [{ role: "user", content: prompt }] });
  let trace = args.trace ?? [{ type: "route" as const, label: `${model.display_name}가 요청과 도구를 분석`, status: "done" as const }];
  let costMicros = args.costMicros ?? 0;

  await updateRunProvider(runId, provider, model.model_id);
  for (let round = 0; round < MAX_AGENT_ROUNDS; round++) {
    const turn = await invokeTurn(provider, model.model_id, state, tools);
    state = turn.state;
    costMicros += await recordUsage(runtimeEnv().DB, { provider, model: model.model_id, text: turn.text, inputUnits: turn.inputUnits, outputUnits: turn.outputUnits }, task, model);
    await recordEvent(request, runId, { type: "model", provider, model: model.model_id, status: "completed", output: turn.text || `${turn.calls.length} tool call(s)` });

    if (!turn.calls.length) {
      let text = turn.text || "작업을 마쳤지만 표시할 응답이 없어요.";
      let reviewedBy: string | undefined;
      if (shouldReview(prompt)) {
        try {
          const reviewed = await reviewAnswer(request, runId, prompt, text, provider, models, task);
          if (reviewed) {
            text = reviewed.text; reviewedBy = reviewed.model; costMicros += reviewed.costMicros;
            trace = [...trace, { type: "review", label: `${reviewed.model} 교차 검토`, status: "done" }];
          }
        } catch {
          trace = [...trace, { type: "review", label: "백업 모델 교차 검토를 건너뜀", status: "error" }];
        }
      }
      await completeRun(request, runId, trace, costMicros);
      return { text, provider, model: model.model_id, task, costUsd: costMicros / 1_000_000, citations: [], live: true, orchestration: { runId, trace, ...(reviewedBy ? { reviewedBy } : {}) } };
    }

    const alreadyPlanned = trace.filter((item) => item.type === "tool").length;
    const remainingCalls = Math.max(0, MAX_TOOL_CALLS_PER_RUN - alreadyPlanned);
    const mapped: PendingCall[] = turn.calls.map((call, index) => {
      const tool = tools.find((candidate) => candidate.alias === call.alias);
      const mappedCall: PendingCall = tool ? { ...call, tool } : { ...call, tool: { alias: call.alias, kind: "mcp", connectionId: null, connectionName: "알 수 없는 도구", toolName: call.alias, description: "", inputSchema: {}, risk: "write" } };
      if (index >= remainingCalls) mappedCall.result = { callId: call.callId, output: safeJson({ error: "Terracotta stopped additional tool calls at the per-request safety limit." }), isError: true };
      return mappedCall;
    });
    const pendingWrites: PendingCall[] = [];
    for (const call of mapped) {
      if (call.result) {
        continue;
      } else if (!tools.some((tool) => tool.alias === call.alias)) {
        call.result = { callId: call.callId, output: safeJson({ error: "Unknown tool" }), isError: true };
      } else if (call.tool.risk === "write") {
        pendingWrites.push(call);
      } else {
        const executed = await executeTool(request, runId, prompt, task, call, models);
        call.result = executed.result; costMicros += executed.costMicros;
        trace = [...trace, { type: "tool", label: `${call.tool.connectionName} · ${call.tool.toolName}`, status: executed.result.isError ? "error" : "done" }];
      }
    }

    if (pendingWrites.length) {
      trace = [...trace, ...pendingWrites.map((call) => ({ type: "tool" as const, label: `${call.tool.connectionName} · ${call.tool.toolName}`, status: "approval" as const }))];
      const expiresAt = await saveApproval(request, runId, provider, model.model_id, state, tools, mapped, trace, costMicros);
      return {
        provider, model: model.model_id, task, costUsd: costMicros / 1_000_000, citations: [], live: true, approvalRequired: true,
        approval: { id: runId, summary: "외부 서비스의 데이터를 변경하는 작업입니다. 아래 내용을 확인해 주세요.", expiresAt, actions: pendingWrites.map((call) => ({ service: call.tool.connectionName, tool: call.tool.toolName, arguments: call.args })) },
        orchestration: { runId, trace },
      };
    }

    state = appendResults(state, mapped.map((call) => call.result!));
  }

  const finalTurn = await invokeTurn(provider, model.model_id, state, []);
  costMicros += await recordUsage(runtimeEnv().DB, { provider, model: model.model_id, text: finalTurn.text, inputUnits: finalTurn.inputUnits, outputUnits: finalTurn.outputUnits }, task, model);
  const text = finalTurn.text || "도구 실행은 마쳤지만 최종 답변을 만들지 못했어요.";
  await completeRun(request, runId, trace, costMicros);
  return { text, provider, model: model.model_id, task, costUsd: costMicros / 1_000_000, citations: [], live: true, orchestration: { runId, trace } };
}

function routingOrder(preference: ModelPreference, models: RegistryRow[]) {
  const latest = chooseLatestFrontier(models);
  const order: PlannerProvider[] = preference === "gpt" ? ["openai", "anthropic"] : preference === "claude" ? ["anthropic", "openai"] : latest?.provider === "anthropic" ? ["anthropic", "openai"] : ["openai", "anthropic"];
  return order.filter((provider) => configured(runtimeEnv(), provider));
}

async function checkBudget() {
  const environment = runtimeEnv();
  const budget = Number(environment.TERRACOTTA_MONTHLY_BUDGET_USD ?? 24) * 1_000_000;
  const spent = await environment.DB.prepare("SELECT COALESCE(SUM(provider_cost_micros),0) AS cost FROM usage_ledger WHERE substr(created_at,1,7)=substr(CURRENT_TIMESTAMP,1,7)").first<{ cost: number }>();
  if (Number(spent?.cost ?? 0) >= budget) throw Object.assign(new Error("이번 달 공급사 원가 예산에 도달했습니다."), { code: "BUDGET_EXHAUSTED", status: 402 });
}

export async function runAssistant(request: Request, prompt: string, preference: ModelPreference): Promise<AssistantResult> {
  await syncProviderRegistry(false);
  await checkBudget();
  const task = classifyTask(prompt);
  const models = await currentModels(runtimeEnv().DB);
  const available = await connectedTools(request);
  const tools = chooseTools(prompt, task, available, configured(runtimeEnv(), "perplexity"));
  const creativeTools = tools.filter((tool) => tool.kind === "mcp" && /(image|video|higgs|media|이미지|영상|generate)/i.test(`${tool.connectionName} ${tool.toolName} ${tool.description}`));
  if (task === "creative" && !creativeTools.length) throw Object.assign(new Error("이미지·영상 생성 MCP를 먼저 연결해 주세요."), { code: "HIGGSFIELD_MCP_AUTH_REQUIRED", status: 409 });

  const run = await createRun(request, prompt, preference, task);
  const order = routingOrder(preference, models);
  const errors: string[] = [];
  for (const provider of order) {
    const model = models.find((item) => item.provider === provider);
    if (!model) continue;
    try { return await runProviderAgent({ request, runId: run.id, prompt, preference, task, provider, model, models, tools: task === "creative" ? creativeTools : tools }); }
    catch (error) {
      errors.push(error instanceof Error ? error.message : `${provider} failed`);
      await recordEvent(request, run.id, { type: "model", provider, model: model.model_id, status: "failed", output: errors.at(-1) });
    }
  }

  if (configured(runtimeEnv(), "perplexity")) {
    const invocation = await invokePerplexity(runtimeEnv().PERPLEXITY_API_KEY!, prompt);
    const costMicros = await recordUsage(runtimeEnv().DB, invocation, task, models.find((item) => item.provider === "perplexity"));
    await runtimeEnv().DB.prepare("UPDATE orchestration_runs SET provider='perplexity', model_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(invocation.model, run.id, ownerId(request)).run();
    const trace: OrchestrationTrace[] = [{ type: "route", label: "Perplexity Sonar Pro 단독 리서치", status: "done" }];
    await completeRun(request, run.id, trace, costMicros);
    return { text: invocation.text, provider: "perplexity", model: invocation.model, task, costUsd: costMicros / 1_000_000, citations: invocation.citations ?? [], live: true, orchestration: { runId: run.id, trace } };
  }
  throw Object.assign(new Error(errors.join(" · ") || "OpenAI, Anthropic 또는 Perplexity API 키가 필요합니다."), { code: order.length ? "PROVIDER_ERROR" : "PROVIDER_KEY_REQUIRED", status: order.length ? 502 : 503 });
}

export async function resolveApproval(request: Request, approvalId: string, decision: "approve" | "reject"): Promise<AssistantResult> {
  const db = runtimeEnv().DB;
  await ensureOrchestration(db);
  const run = await db.prepare("SELECT * FROM orchestration_runs WHERE id=? AND owner_id=?").bind(approvalId, ownerId(request)).first<RunRow>();
  if (!run) throw Object.assign(new Error("승인 요청을 찾을 수 없어요."), { code: "APPROVAL_NOT_FOUND", status: 404 });
  if (run.status !== "approval_required") throw Object.assign(new Error("이미 처리됐거나 유효하지 않은 승인 요청이에요."), { code: "APPROVAL_ALREADY_RESOLVED", status: 409 });
  if (new Date(run.expires_at).getTime() < Date.now()) throw Object.assign(new Error("승인 요청이 만료됐어요. 작업을 다시 요청해 주세요."), { code: "APPROVAL_EXPIRED", status: 410 });

  const state = parseJson<ProviderState>(run.state_json, { kind: "openai", input: [] });
  const tools = parseJson<OrchestratorTool[]>(run.tools_json, []);
  const calls = parseJson<PendingCall[]>(run.pending_calls_json, []);
  let trace = parseJson<OrchestrationTrace[]>(run.trace_json, []);
  let costMicros = Number(run.cost_micros ?? 0);
  const models = await currentModels(db);
  const results: ToolResult[] = [];

  for (const call of calls) {
    if (call.result) { results.push(call.result); continue; }
    if (decision === "reject") {
      const denied = { callId: call.callId, output: safeJson({ denied: true, message: "사용자가 외부 변경을 승인하지 않았습니다." }), isError: true };
      results.push(denied);
      await recordEvent(request, run.id, { type: "approval", provider: "mcp", connectionId: call.tool.connectionId, tool: call.tool.toolName, risk: call.tool.risk, status: "rejected", input: call.args, output: denied.output });
      trace = trace.map((item) => item.status === "approval" && item.label === `${call.tool.connectionName} · ${call.tool.toolName}` ? { ...item, status: "error" } : item);
    } else {
      const executed = await executeTool(request, run.id, run.prompt, run.task_kind, call, models);
      results.push(executed.result); costMicros += executed.costMicros;
      trace = trace.map((item) => item.status === "approval" && item.label === `${call.tool.connectionName} · ${call.tool.toolName}` ? { ...item, status: executed.result.isError ? "error" : "done" } : item);
    }
  }

  await db.prepare("UPDATE orchestration_runs SET status='running', pending_calls_json='[]', updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(run.id, ownerId(request)).run();
  const model = models.find((item) => item.provider === run.provider && item.model_id === run.model_id) ?? models.find((item) => item.provider === run.provider);
  if (!model) throw Object.assign(new Error("승인 후 작업을 이어갈 모델을 찾지 못했어요."), { code: "MODEL_UNAVAILABLE", status: 503 });
  return runProviderAgent({ request, runId: run.id, prompt: run.prompt, preference: run.preference, task: run.task_kind, provider: run.provider, model, models, tools, state: appendResults(state, results), trace, costMicros });
}
