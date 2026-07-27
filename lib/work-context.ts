import { ownerId } from "./mcp-hub";
import { runtimeEnv } from "./terracotta-router";

export type ContextProvider = "openai" | "anthropic" | "perplexity";

export type WorkSession = {
  id: string;
  owner_id: string;
  title: string;
  goal: string;
  last_provider: ContextProvider | null;
  last_model_id: string | null;
  created_at: string;
  updated_at: string;
};

export type WorkTurn = {
  id: string;
  session_id: string;
  owner_id: string;
  role: "user" | "assistant";
  provider: ContextProvider | null;
  model_id: string | null;
  content: string;
  trace_json: string;
  run_id: string | null;
  created_at: string;
};

export type ContextHandoff = {
  id: string;
  session_id: string;
  from: ContextProvider;
  to: ContextProvider;
  label: string;
};

const workContextSchema = [
  `CREATE TABLE IF NOT EXISTS work_sessions (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL, goal TEXT DEFAULT '' NOT NULL, last_provider TEXT, last_model_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS work_sessions_owner_idx ON work_sessions (owner_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS work_turns (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, owner_id TEXT NOT NULL, role TEXT NOT NULL, provider TEXT, model_id TEXT, content TEXT NOT NULL, trace_json TEXT DEFAULT '[]' NOT NULL, run_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS work_turns_session_idx ON work_turns (session_id, owner_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS context_handoffs (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, owner_id TEXT NOT NULL, from_provider TEXT NOT NULL, to_provider TEXT NOT NULL, packet_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS context_handoffs_session_idx ON context_handoffs (session_id, owner_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS context_run_links (run_id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
];

function compact(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function titleFromPrompt(prompt: string) {
  const title = compact(prompt, 46);
  return title.length < prompt.trim().length ? `${title}…` : title || "새 작업";
}

function providerLabel(provider: ContextProvider) {
  if (provider === "openai") return "GPT";
  if (provider === "anthropic") return "Claude";
  return "Perplexity";
}

export async function ensureWorkContext(db = runtimeEnv().DB) {
  await db.batch(workContextSchema.map((statement) => db.prepare(statement)));
}

export async function createWorkSession(request: Request, title = "새 작업") {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session: WorkSession = {
    id: crypto.randomUUID(),
    owner_id: ownerId(request),
    title: compact(title, 60) || "새 작업",
    goal: "",
    last_provider: null,
    last_model_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.prepare("INSERT INTO work_sessions (id, owner_id, title, goal) VALUES (?, ?, ?, '')")
    .bind(session.id, session.owner_id, session.title).run();
  return session;
}

async function findSession(request: Request, sessionId?: string | null) {
  const db = runtimeEnv().DB;
  const owner = ownerId(request);
  if (sessionId) {
    const explicit = await db.prepare("SELECT * FROM work_sessions WHERE id=? AND owner_id=?")
      .bind(sessionId, owner).first<WorkSession>();
    if (explicit) return explicit;
  }
  return db.prepare("SELECT * FROM work_sessions WHERE owner_id=? ORDER BY updated_at DESC LIMIT 1")
    .bind(owner).first<WorkSession>();
}

async function loadTurns(request: Request, sessionId: string, limit = 50) {
  const result = await runtimeEnv().DB.prepare("SELECT * FROM work_turns WHERE session_id=? AND owner_id=? ORDER BY created_at DESC LIMIT ?")
    .bind(sessionId, ownerId(request), limit).all<WorkTurn>();
  return (result.results ?? []).reverse();
}

function contextWindow(turns: WorkTurn[], maxChars = 48_000) {
  const selected: WorkTurn[] = [];
  let chars = 0;
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index];
    if (selected.length && chars + turn.content.length > maxChars) break;
    selected.unshift(turn);
    chars += turn.content.length;
  }
  return selected;
}

export async function prepareWorkSession(request: Request, sessionId: string | null | undefined, prompt: string) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  let session = await findSession(request, sessionId);
  if (!session || (sessionId && session.id !== sessionId)) session = await createWorkSession(request, titleFromPrompt(prompt));
  if (!session.goal) {
    const title = titleFromPrompt(prompt);
    await db.prepare("UPDATE work_sessions SET title=?, goal=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
      .bind(title, compact(prompt, 1_200), session.id, ownerId(request)).run();
    session = { ...session, title, goal: compact(prompt, 1_200) };
  }
  return { session, turns: contextWindow(await loadTurns(request, session.id)) };
}

export async function appendUserTurn(request: Request, sessionId: string, prompt: string, runId: string) {
  const db = runtimeEnv().DB;
  await db.prepare("INSERT INTO work_turns (id, session_id, owner_id, role, content, run_id) VALUES (?, ?, ?, 'user', ?, ?)")
    .bind(crypto.randomUUID(), sessionId, ownerId(request), prompt, runId).run();
  await db.prepare("UPDATE work_sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
    .bind(sessionId, ownerId(request)).run();
}

export async function appendAssistantTurn(request: Request, sessionId: string, result: {
  provider: ContextProvider;
  model: string;
  text: string;
  runId: string;
  trace: unknown[];
}) {
  const db = runtimeEnv().DB;
  await db.prepare("INSERT INTO work_turns (id, session_id, owner_id, role, provider, model_id, content, trace_json, run_id) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), sessionId, ownerId(request), result.provider, result.model, result.text.slice(0, 40_000), JSON.stringify(result.trace), result.runId).run();
  await db.prepare("UPDATE work_sessions SET last_provider=?, last_model_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
    .bind(result.provider, result.model, sessionId, ownerId(request)).run();
}

export async function linkRunToSession(request: Request, runId: string, sessionId: string) {
  await runtimeEnv().DB.prepare("INSERT OR REPLACE INTO context_run_links (run_id, session_id, owner_id) VALUES (?, ?, ?)")
    .bind(runId, sessionId, ownerId(request)).run();
}

export async function sessionForRun(request: Request, runId: string) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  return db.prepare("SELECT s.* FROM work_sessions s JOIN context_run_links l ON l.session_id=s.id WHERE l.run_id=? AND l.owner_id=? AND s.owner_id=?")
    .bind(runId, ownerId(request), ownerId(request)).first<WorkSession>();
}

export function buildProviderHistory(provider: "openai" | "anthropic", turns: WorkTurn[], prompt: string) {
  const messages = turns.map((turn) => {
    let content = turn.content;
    if (turn.role === "assistant") {
      try {
        const trace = JSON.parse(turn.trace_json) as Array<{ type?: string; label?: string; status?: string }>;
        const executed = trace.filter((item) => item.type === "tool" && item.status === "done" && item.label).map((item) => item.label);
        if (executed.length) content += `\n\n[검증된 도구 실행 기록: ${executed.join(", ")}]`;
      } catch { /* 손상된 부가 기록은 대화 본문에서 제외합니다. */ }
    }
    return { role: turn.role, content };
  });
  messages.push({ role: "user" as const, content: prompt });
  if (provider === "openai") return { kind: "openai" as const, input: messages };

  const normalized: Array<{ role: "user" | "assistant"; content: string }> = [];
  for (const message of messages) {
    const previous = normalized.at(-1);
    if (previous?.role === message.role) previous.content += `\n\n${message.content}`;
    else normalized.push({ role: message.role, content: message.content });
  }
  return { kind: "anthropic" as const, messages: normalized };
}

export async function recordContextHandoff(request: Request, session: WorkSession, to: ContextProvider, turns: WorkTurn[], prompt: string): Promise<ContextHandoff | null> {
  const from = session.last_provider;
  if (!from || from === to) return null;
  const handoff: ContextHandoff = {
    id: crypto.randomUUID(),
    session_id: session.id,
    from,
    to,
    label: `${providerLabel(from)} → ${providerLabel(to)} 컨텍스트 인계`,
  };
  const packet = {
    version: 1,
    goal: session.goal,
    from,
    to,
    visibleTurns: contextWindow(turns, 24_000).map((turn) => ({
      role: turn.role,
      provider: turn.provider,
      model: turn.model_id,
      content: turn.content,
    })),
    currentRequest: prompt,
    policy: "Only user-visible messages, final outputs, and verified tool summaries are transferred. Hidden reasoning is never transferred.",
  };
  await runtimeEnv().DB.prepare("INSERT INTO context_handoffs (id, session_id, owner_id, from_provider, to_provider, packet_json) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(handoff.id, session.id, ownerId(request), from, to, JSON.stringify(packet)).run();
  return handoff;
}

export async function getWorkContext(request: Request, sessionId?: string | null) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session = await findSession(request, sessionId);
  const recent = await db.prepare("SELECT * FROM work_sessions WHERE owner_id=? ORDER BY updated_at DESC LIMIT 8")
    .bind(ownerId(request)).all<WorkSession>();
  if (!session) return { session: null, turns: [], recentSessions: recent.results ?? [] };
  return { session, turns: await loadTurns(request, session.id, 80), recentSessions: recent.results ?? [] };
}
