import { ownerId } from "./mcp-hub";
import { runtimeEnv } from "./terracotta-router";

type AgentRow = {
  id: string;
  owner_id: string;
  name: string;
  token_hash: string;
  platform: string | null;
  shell: string | null;
  workspace: string | null;
  last_seen_at: string | null;
  created_at: string;
  revoked_at: string | null;
};

type JobRow = {
  id: string;
  agent_id: string;
  owner_id: string;
  run_id: string | null;
  command: string;
  cwd: string;
  timeout_seconds: number;
  status: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

const AGENT_ONLINE_MS = 45_000;
const MAX_COMMAND_LENGTH = 4_000;
const MAX_OUTPUT_LENGTH = 100_000;

const localAgentSchema = [
  `CREATE TABLE IF NOT EXISTS local_agents (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, platform TEXT, shell TEXT, workspace TEXT, last_seen_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, revoked_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS local_agents_owner_idx ON local_agents (owner_id, revoked_at, last_seen_at)`,
  `CREATE TABLE IF NOT EXISTS local_agent_jobs (id TEXT PRIMARY KEY NOT NULL, agent_id TEXT NOT NULL, owner_id TEXT NOT NULL, run_id TEXT, command TEXT NOT NULL, cwd TEXT DEFAULT '.' NOT NULL, timeout_seconds INTEGER DEFAULT 30 NOT NULL, status TEXT DEFAULT 'queued' NOT NULL, stdout TEXT DEFAULT '' NOT NULL, stderr TEXT DEFAULT '' NOT NULL, exit_code INTEGER, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, started_at TEXT, completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS local_agent_jobs_claim_idx ON local_agent_jobs (agent_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS local_agent_jobs_owner_idx ON local_agent_jobs (owner_id, created_at)`,
];

function db() {
  return runtimeEnv().DB;
}

async function ensureLocalAgentTables() {
  await db().batch(localAgentSchema.map((statement) => db().prepare(statement)));
  const staleBefore = new Date(Date.now() - 15 * 60_000).toISOString();
  await db().prepare("UPDATE local_agent_jobs SET status='expired', completed_at=CURRENT_TIMESTAMP, stderr='Local agent did not claim this command before it expired.' WHERE status='queued' AND created_at < ?").bind(staleBefore).run();
}

function base64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function online(lastSeenAt: string | null) {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < AGENT_ONLINE_MS);
}

function publicAgent(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform,
    shell: row.shell,
    workspace: row.workspace,
    online: online(row.last_seen_at),
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
  };
}

function publicJob(row: JobRow) {
  return {
    id: row.id,
    agentId: row.agent_id,
    command: row.command,
    cwd: row.cwd,
    status: row.status,
    stdout: row.stdout.slice(0, 8_000),
    stderr: row.stderr.slice(0, 8_000),
    exitCode: row.exit_code,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function localAgentDashboard(request: Request) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  const [agents, jobs] = await Promise.all([
    db().prepare("SELECT * FROM local_agents WHERE owner_id=? AND revoked_at IS NULL ORDER BY COALESCE(last_seen_at, created_at) DESC").bind(owner).all<AgentRow>(),
    db().prepare("SELECT * FROM local_agent_jobs WHERE owner_id=? ORDER BY created_at DESC LIMIT 12").bind(owner).all<JobRow>(),
  ]);
  return {
    agents: agents.results.map(publicAgent),
    jobs: jobs.results.map(publicJob),
    connected: agents.results.some((agent) => online(agent.last_seen_at)),
  };
}

export async function createLocalAgent(request: Request, name?: string) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  const token = `tca_${base64Url(bytes)}`;
  const id = crypto.randomUUID();
  const label = name?.trim().slice(0, 50) || "내 컴퓨터";
  await db().prepare("INSERT INTO local_agents (id, owner_id, name, token_hash) VALUES (?, ?, ?, ?)")
    .bind(id, owner, label, await hashToken(token)).run();
  return { id, name: label, token };
}

export async function revokeLocalAgent(request: Request, id: string) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  await db().batch([
    db().prepare("UPDATE local_agents SET revoked_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(id, owner),
    db().prepare("UPDATE local_agent_jobs SET status='cancelled', completed_at=CURRENT_TIMESTAMP, stderr='Agent connection was revoked.' WHERE agent_id=? AND owner_id=? AND status='queued'").bind(id, owner),
  ]);
  return { revoked: true };
}

async function authenticatedAgent(request: Request) {
  await ensureLocalAgentTables();
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token.startsWith("tca_")) return null;
  return db().prepare("SELECT * FROM local_agents WHERE token_hash=? AND revoked_at IS NULL").bind(await hashToken(token)).first<AgentRow>();
}

export async function handleLocalAgentRequest(request: Request, payload: Record<string, unknown>) {
  const agent = await authenticatedAgent(request);
  if (!agent) throw Object.assign(new Error("유효하지 않거나 해제된 로컬 에이전트 키입니다."), { status: 401 });
  const action = String(payload.action ?? "claim");
  const now = new Date().toISOString();

  if (action === "hello" || action === "claim") {
    const name = String(payload.name ?? agent.name).trim().slice(0, 50) || agent.name;
    const platform = String(payload.platform ?? agent.platform ?? "unknown").slice(0, 30);
    const shell = String(payload.shell ?? agent.shell ?? "unknown").slice(0, 120);
    const workspace = String(payload.workspace ?? agent.workspace ?? "").slice(0, 1_000);
    await db().prepare("UPDATE local_agents SET name=?, platform=?, shell=?, workspace=?, last_seen_at=? WHERE id=?")
      .bind(name, platform, shell, workspace, now, agent.id).run();
    if (action === "hello") return { connected: true, agentId: agent.id };

    const job = await db().prepare("SELECT * FROM local_agent_jobs WHERE agent_id=? AND owner_id=? AND status='queued' ORDER BY created_at LIMIT 1")
      .bind(agent.id, agent.owner_id).first<JobRow>();
    if (!job) return { job: null };
    const claimed = await db().prepare("UPDATE local_agent_jobs SET status='running', started_at=? WHERE id=? AND agent_id=? AND status='queued'")
      .bind(now, job.id, agent.id).run();
    if (!claimed.meta.changes) return { job: null };
    return {
      job: {
        id: job.id,
        command: job.command,
        cwd: job.cwd,
        timeoutSeconds: job.timeout_seconds,
      },
    };
  }

  if (action === "result") {
    const jobId = String(payload.jobId ?? "");
    const stdout = String(payload.stdout ?? "").slice(0, MAX_OUTPUT_LENGTH);
    const stderr = String(payload.stderr ?? "").slice(0, MAX_OUTPUT_LENGTH);
    const exitCode = Number.isFinite(Number(payload.exitCode)) ? Number(payload.exitCode) : -1;
    const status = payload.status === "timed_out" ? "timed_out" : exitCode === 0 ? "completed" : "failed";
    const completed = await db().prepare("UPDATE local_agent_jobs SET status=?, stdout=?, stderr=?, exit_code=?, completed_at=? WHERE id=? AND agent_id=? AND owner_id=? AND status='running'")
      .bind(status, stdout, stderr, exitCode, now, jobId, agent.id, agent.owner_id).run();
    if (!completed.meta.changes) throw Object.assign(new Error("실행 중인 작업을 찾지 못했습니다."), { status: 409 });
    await db().prepare("UPDATE local_agents SET last_seen_at=? WHERE id=?").bind(now, agent.id).run();
    return { saved: true };
  }

  throw Object.assign(new Error("지원하지 않는 로컬 에이전트 작업입니다."), { status: 400 });
}

export async function connectedLocalAgentTools(request: Request) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  const cutoff = new Date(Date.now() - AGENT_ONLINE_MS).toISOString();
  const agents = await db().prepare("SELECT * FROM local_agents WHERE owner_id=? AND revoked_at IS NULL AND last_seen_at >= ? ORDER BY last_seen_at DESC")
    .bind(owner, cutoff).all<AgentRow>();
  return agents.results.map((agent) => ({
    alias: `local_shell_${agent.id.replace(/-/g, "").slice(0, 16)}`,
    kind: "local_shell" as const,
    connectionId: agent.id,
    connectionName: agent.name,
    toolName: "run_terminal_command",
    description: `[로컬 변경 · 사용자 승인 필수] ${agent.name}의 ${agent.shell ?? "터미널"}에서 작업 폴더 안의 명령을 실행합니다. 파일 읽기·수정, 빌드, 테스트, Git 작업에 사용하세요. 대화형 프로그램과 시스템 관리 명령은 실행할 수 없습니다.`,
    inputSchema: {
      type: "object",
      properties: {
        command: { type: "string", description: "실행할 비대화형 터미널 명령 한 개" },
        cwd: { type: "string", description: "연결된 workspace 기준 상대 경로. 기본값은 ." },
        timeoutSeconds: { type: "integer", minimum: 1, maximum: 120, description: "실행 제한 시간" },
      },
      required: ["command"],
      additionalProperties: false,
    },
    risk: "write" as const,
  }));
}

export async function runLocalAgentTool(request: Request, runId: string, agentId: string, args: Record<string, unknown>) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  const cutoff = new Date(Date.now() - AGENT_ONLINE_MS).toISOString();
  const agent = await db().prepare("SELECT * FROM local_agents WHERE id=? AND owner_id=? AND revoked_at IS NULL AND last_seen_at >= ?")
    .bind(agentId, owner, cutoff).first<AgentRow>();
  if (!agent) throw new Error("로컬 에이전트가 오프라인입니다. 로컬 연결 화면에서 다시 실행해 주세요.");
  const command = String(args.command ?? "").trim();
  if (!command || command.length > MAX_COMMAND_LENGTH) throw new Error("터미널 명령은 1자 이상 4,000자 이하여야 합니다.");
  const cwd = String(args.cwd ?? ".").trim().slice(0, 1_000) || ".";
  const timeoutSeconds = Math.min(120, Math.max(1, Number(args.timeoutSeconds ?? 30) || 30));
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO local_agent_jobs (id, agent_id, owner_id, run_id, command, cwd, timeout_seconds) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(id, agent.id, owner, runId, command, cwd, timeoutSeconds).run();

  const waitUntil = Date.now() + Math.min(30_000, timeoutSeconds * 1_000 + 4_000);
  while (Date.now() < waitUntil) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const job = await db().prepare("SELECT * FROM local_agent_jobs WHERE id=? AND owner_id=?").bind(id, owner).first<JobRow>();
    if (job && !["queued", "running"].includes(job.status)) return publicJob(job);
  }
  return { id, agentId: agent.id, command, cwd, status: "running", message: "명령을 로컬 컴퓨터에서 실행 중입니다. 로컬 연결 화면에서 결과를 확인할 수 있습니다." };
}
