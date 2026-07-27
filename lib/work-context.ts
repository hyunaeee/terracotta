import { ownerId } from "./mcp-hub";
import { runtimeEnv } from "./terracotta-router";

export type ContextProvider = "openai" | "anthropic" | "perplexity";
export type SessionRole = "owner" | "editor" | "viewer";

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

export type WorkSessionAccess = WorkSession & { access_role: SessionRole };

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

export type TeamMember = {
  email: string;
  role: SessionRole;
  invitedBy: string | null;
  createdAt: string;
};

export type TeamHandoff = {
  id: string;
  session_id: string;
  from_email: string;
  to_email: string;
  note: string;
  status: "pending" | "accepted";
  created_at: string;
  accepted_at: string | null;
};

const workContextSchema = [
  `CREATE TABLE IF NOT EXISTS work_sessions (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, title TEXT NOT NULL, goal TEXT DEFAULT '' NOT NULL, last_provider TEXT, last_model_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS work_sessions_owner_idx ON work_sessions (owner_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS work_turns (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, owner_id TEXT NOT NULL, role TEXT NOT NULL, provider TEXT, model_id TEXT, content TEXT NOT NULL, trace_json TEXT DEFAULT '[]' NOT NULL, run_id TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS work_turns_session_idx ON work_turns (session_id, owner_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS context_handoffs (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, owner_id TEXT NOT NULL, from_provider TEXT NOT NULL, to_provider TEXT NOT NULL, packet_json TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS context_handoffs_session_idx ON context_handoffs (session_id, owner_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS context_run_links (run_id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, owner_id TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS work_session_members (session_id TEXT NOT NULL, member_email TEXT NOT NULL, role TEXT DEFAULT 'editor' NOT NULL, invited_by TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, PRIMARY KEY (session_id, member_email))`,
  `CREATE INDEX IF NOT EXISTS work_session_members_email_idx ON work_session_members (member_email, updated_at)`,
  `CREATE TABLE IF NOT EXISTS team_handoffs (id TEXT PRIMARY KEY NOT NULL, session_id TEXT NOT NULL, from_email TEXT NOT NULL, to_email TEXT NOT NULL, note TEXT DEFAULT '' NOT NULL, status TEXT DEFAULT 'pending' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, accepted_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS team_handoffs_recipient_idx ON team_handoffs (to_email, status, created_at)`,
];

function compact(value: string, max: number) {
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
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

function accessError(message = "이 작업을 편집할 권한이 없어요.") {
  return Object.assign(new Error(message), { code: "CONTEXT_FORBIDDEN", status: 403 });
}

function missingError() {
  return Object.assign(new Error("공유됐거나 내가 만든 작업을 찾을 수 없어요."), { code: "CONTEXT_NOT_FOUND", status: 404 });
}

function assertEmail(email: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw Object.assign(new Error("초대할 팀원의 이메일을 확인해 주세요."), { code: "INVALID_MEMBER_EMAIL", status: 400 });
  }
}

function assertCanEdit(session: WorkSessionAccess) {
  if (session.access_role === "viewer") throw accessError();
}

export async function ensureWorkContext(db = runtimeEnv().DB) {
  await db.batch(workContextSchema.map((statement) => db.prepare(statement)));
}

export async function createWorkSession(request: Request, title = "새 작업"): Promise<WorkSessionAccess> {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session: WorkSessionAccess = {
    id: crypto.randomUUID(),
    owner_id: ownerId(request),
    title: compact(title, 60) || "새 작업",
    goal: "",
    last_provider: null,
    last_model_id: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    access_role: "owner",
  };
  await db.prepare("INSERT INTO work_sessions (id, owner_id, title, goal) VALUES (?, ?, ?, '')")
    .bind(session.id, session.owner_id, session.title).run();
  return session;
}

async function findSession(request: Request, sessionId?: string | null): Promise<WorkSessionAccess | null> {
  const db = runtimeEnv().DB;
  const actor = ownerId(request);
  const projection = `SELECT s.*, CASE WHEN s.owner_id=? THEN 'owner' ELSE (SELECT m.role FROM work_session_members m WHERE m.session_id=s.id AND m.member_email=? LIMIT 1) END AS access_role FROM work_sessions s`;
  if (sessionId) {
    return db.prepare(`${projection} WHERE s.id=? AND (s.owner_id=? OR EXISTS (SELECT 1 FROM work_session_members m WHERE m.session_id=s.id AND m.member_email=?))`)
      .bind(actor, actor, sessionId, actor, actor).first<WorkSessionAccess>();
  }
  return db.prepare(`${projection} WHERE s.owner_id=? OR EXISTS (SELECT 1 FROM work_session_members m WHERE m.session_id=s.id AND m.member_email=?) ORDER BY s.updated_at DESC LIMIT 1`)
    .bind(actor, actor, actor, actor).first<WorkSessionAccess>();
}

async function requireSession(request: Request, sessionId: string) {
  const session = await findSession(request, sessionId);
  if (!session) throw missingError();
  return session;
}

async function loadTurns(sessionId: string, limit = 50) {
  const result = await runtimeEnv().DB.prepare("SELECT * FROM work_turns WHERE session_id=? ORDER BY created_at DESC LIMIT ?")
    .bind(sessionId, limit).all<WorkTurn>();
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
  if (!session) {
    if (sessionId && !sessionId.startsWith("new-")) throw missingError();
    session = await createWorkSession(request, titleFromPrompt(prompt));
  }
  assertCanEdit(session);
  if (!session.goal) {
    const title = titleFromPrompt(prompt);
    await db.prepare("UPDATE work_sessions SET title=?, goal=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
      .bind(title, compact(prompt, 1_200), session.id).run();
    session = { ...session, title, goal: compact(prompt, 1_200) };
  }
  return { session, turns: contextWindow(await loadTurns(session.id)) };
}

export async function appendUserTurn(request: Request, sessionId: string, prompt: string, runId: string) {
  const db = runtimeEnv().DB;
  const session = await requireSession(request, sessionId);
  assertCanEdit(session);
  await db.prepare("INSERT INTO work_turns (id, session_id, owner_id, role, content, run_id) VALUES (?, ?, ?, 'user', ?, ?)")
    .bind(crypto.randomUUID(), sessionId, ownerId(request), prompt, runId).run();
  await db.prepare("UPDATE work_sessions SET updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(sessionId).run();
}

export async function appendAssistantTurn(request: Request, sessionId: string, result: {
  provider: ContextProvider;
  model: string;
  text: string;
  runId: string;
  trace: unknown[];
}) {
  const db = runtimeEnv().DB;
  const session = await requireSession(request, sessionId);
  assertCanEdit(session);
  await db.prepare("INSERT INTO work_turns (id, session_id, owner_id, role, provider, model_id, content, trace_json, run_id) VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), sessionId, ownerId(request), result.provider, result.model, result.text.slice(0, 40_000), JSON.stringify(result.trace), result.runId).run();
  await db.prepare("UPDATE work_sessions SET last_provider=?, last_model_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?")
    .bind(result.provider, result.model, sessionId).run();
}

export async function linkRunToSession(request: Request, runId: string, sessionId: string) {
  const session = await requireSession(request, sessionId);
  assertCanEdit(session);
  await runtimeEnv().DB.prepare("INSERT OR REPLACE INTO context_run_links (run_id, session_id, owner_id) VALUES (?, ?, ?)")
    .bind(runId, sessionId, ownerId(request)).run();
}

export async function sessionForRun(request: Request, runId: string) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const link = await db.prepare("SELECT session_id FROM context_run_links WHERE run_id=? AND owner_id=?")
    .bind(runId, ownerId(request)).first<{ session_id: string }>();
  if (!link) return null;
  const session = await findSession(request, link.session_id);
  if (session) assertCanEdit(session);
  return session;
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
    const author = turn.role === "user" ? `팀원 ${turn.owner_id}` : "Terracotta";
    return { role: turn.role, content: `[${author}]\n${content}` };
  });
  messages.push({ role: "user" as const, content: `[현재 팀원]\n${prompt}` });
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
  const accessible = await requireSession(request, session.id);
  assertCanEdit(accessible);
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
      author: turn.owner_id,
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

async function listMembers(session: WorkSessionAccess) {
  const result = await runtimeEnv().DB.prepare("SELECT member_email, role, invited_by, created_at FROM work_session_members WHERE session_id=? ORDER BY created_at")
    .bind(session.id).all<{ member_email: string; role: SessionRole; invited_by: string; created_at: string }>();
  const owner: TeamMember = { email: session.owner_id, role: "owner", invitedBy: null, createdAt: session.created_at };
  return [owner, ...(result.results ?? []).map((member) => ({
    email: member.member_email,
    role: member.role,
    invitedBy: member.invited_by,
    createdAt: member.created_at,
  }))];
}

async function listTeamHandoffs(request: Request, session: WorkSessionAccess) {
  const actor = ownerId(request);
  const query = session.access_role === "owner"
    ? "SELECT * FROM team_handoffs WHERE session_id=? ORDER BY created_at DESC LIMIT 12"
    : "SELECT * FROM team_handoffs WHERE session_id=? AND (from_email=? OR to_email=?) ORDER BY created_at DESC LIMIT 12";
  const statement = runtimeEnv().DB.prepare(query);
  const result = session.access_role === "owner"
    ? await statement.bind(session.id).all<TeamHandoff>()
    : await statement.bind(session.id, actor, actor).all<TeamHandoff>();
  return result.results ?? [];
}

export async function shareWorkSession(request: Request, sessionId: string, memberEmail: string, role: Exclude<SessionRole, "owner">, note = "") {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session = await requireSession(request, sessionId);
  if (session.access_role !== "owner") throw accessError("작업 소유자만 팀원을 초대하거나 권한을 바꿀 수 있어요.");
  const email = normalizeEmail(memberEmail);
  assertEmail(email);
  if (email === session.owner_id) throw Object.assign(new Error("작업 소유자는 이미 팀에 포함되어 있어요."), { code: "MEMBER_IS_OWNER", status: 409 });
  if (role !== "editor" && role !== "viewer") throw Object.assign(new Error("팀원 권한이 올바르지 않아요."), { code: "INVALID_MEMBER_ROLE", status: 400 });

  const statements = [
    db.prepare("INSERT INTO work_session_members (session_id, member_email, role, invited_by) VALUES (?, ?, ?, ?) ON CONFLICT(session_id, member_email) DO UPDATE SET role=excluded.role, invited_by=excluded.invited_by, updated_at=CURRENT_TIMESTAMP")
      .bind(session.id, email, role, ownerId(request)),
  ];
  let handoff: TeamHandoff | null = null;
  const handoffNote = compact(note, 1_200);
  if (role === "editor" && handoffNote) {
    handoff = {
      id: crypto.randomUUID(),
      session_id: session.id,
      from_email: ownerId(request),
      to_email: email,
      note: handoffNote,
      status: "pending",
      created_at: new Date().toISOString(),
      accepted_at: null,
    };
    statements.push(db.prepare("INSERT INTO team_handoffs (id, session_id, from_email, to_email, note) VALUES (?, ?, ?, ?, ?)")
      .bind(handoff.id, session.id, handoff.from_email, email, handoffNote));
  }
  await db.batch(statements);
  return { session, members: await listMembers(session), handoff };
}

export async function handoffWorkSession(request: Request, sessionId: string, memberEmail: string, note: string) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session = await requireSession(request, sessionId);
  assertCanEdit(session);
  const email = normalizeEmail(memberEmail);
  const targetRole = email === session.owner_id
    ? "owner"
    : (await db.prepare("SELECT role FROM work_session_members WHERE session_id=? AND member_email=?").bind(sessionId, email).first<{ role: SessionRole }>())?.role;
  if (targetRole !== "owner" && targetRole !== "editor") {
    throw Object.assign(new Error("편집 가능한 팀원에게만 작업을 넘길 수 있어요."), { code: "HANDOFF_TARGET_NOT_EDITOR", status: 409 });
  }
  const handoff: TeamHandoff = {
    id: crypto.randomUUID(),
    session_id: session.id,
    from_email: ownerId(request),
    to_email: email,
    note: compact(note, 1_200) || "이 작업을 이어서 진행해 주세요.",
    status: "pending",
    created_at: new Date().toISOString(),
    accepted_at: null,
  };
  await db.prepare("INSERT INTO team_handoffs (id, session_id, from_email, to_email, note) VALUES (?, ?, ?, ?, ?)")
    .bind(handoff.id, session.id, handoff.from_email, email, handoff.note).run();
  return handoff;
}

export async function revokeWorkSessionMember(request: Request, sessionId: string, memberEmail: string) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session = await requireSession(request, sessionId);
  if (session.access_role !== "owner") throw accessError("작업 소유자만 팀원의 공유 권한을 해제할 수 있어요.");
  const email = normalizeEmail(memberEmail);
  await db.batch([
    db.prepare("DELETE FROM work_session_members WHERE session_id=? AND member_email=?").bind(session.id, email),
    db.prepare("UPDATE team_handoffs SET status='accepted', accepted_at=CURRENT_TIMESTAMP WHERE session_id=? AND to_email=? AND status='pending'").bind(session.id, email),
  ]);
}

export async function acceptTeamHandoff(request: Request, sessionId: string, handoffId: string) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const session = await requireSession(request, sessionId);
  assertCanEdit(session);
  const result = await db.prepare("UPDATE team_handoffs SET status='accepted', accepted_at=CURRENT_TIMESTAMP WHERE id=? AND session_id=? AND to_email=? AND status='pending'")
    .bind(handoffId, session.id, ownerId(request)).run();
  if (!result.meta.changes) throw Object.assign(new Error("이어받을 작업을 찾을 수 없거나 이미 처리됐어요."), { code: "HANDOFF_NOT_FOUND", status: 404 });
}

export async function getWorkContext(request: Request, sessionId?: string | null) {
  const db = runtimeEnv().DB;
  await ensureWorkContext(db);
  const actor = ownerId(request);
  const session = await findSession(request, sessionId);
  const recent = await db.prepare(`SELECT s.*, CASE WHEN s.owner_id=? THEN 'owner' ELSE (SELECT m.role FROM work_session_members m WHERE m.session_id=s.id AND m.member_email=? LIMIT 1) END AS access_role FROM work_sessions s WHERE s.owner_id=? OR EXISTS (SELECT 1 FROM work_session_members m WHERE m.session_id=s.id AND m.member_email=?) ORDER BY s.updated_at DESC LIMIT 8`)
    .bind(actor, actor, actor, actor).all<WorkSessionAccess>();
  if (!session) return { currentUser: actor, session: null, turns: [], members: [], handoffs: [], recentSessions: recent.results ?? [] };
  return {
    currentUser: actor,
    session,
    turns: await loadTurns(session.id, 80),
    members: await listMembers(session),
    handoffs: await listTeamHandoffs(request, session),
    recentSessions: recent.results ?? [],
  };
}
