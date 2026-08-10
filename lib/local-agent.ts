import { ownerId } from "./mcp-hub";
import { runtimeEnv } from "./terracotta-router";
import { recordProjectActivity, requireWorkspaceProject, type WorkspaceProject } from "./workspace-projects";

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
  project_id: string | null;
  operation: string;
  args_json: string;
  command: string;
  cwd: string;
  timeout_seconds: number;
  status: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  changed_files_json: string;
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
  `CREATE TABLE IF NOT EXISTS local_agent_jobs (id TEXT PRIMARY KEY NOT NULL, agent_id TEXT NOT NULL, owner_id TEXT NOT NULL, run_id TEXT, project_id TEXT, operation TEXT DEFAULT 'run_terminal_command' NOT NULL, args_json TEXT DEFAULT '{}' NOT NULL, command TEXT NOT NULL, cwd TEXT DEFAULT '.' NOT NULL, timeout_seconds INTEGER DEFAULT 30 NOT NULL, status TEXT DEFAULT 'queued' NOT NULL, stdout TEXT DEFAULT '' NOT NULL, stderr TEXT DEFAULT '' NOT NULL, exit_code INTEGER, changed_files_json TEXT DEFAULT '[]' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, started_at TEXT, completed_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS local_agent_jobs_claim_idx ON local_agent_jobs (agent_id, status, created_at)`,
  `CREATE INDEX IF NOT EXISTS local_agent_jobs_owner_idx ON local_agent_jobs (owner_id, created_at)`,
];

function db() {
  return runtimeEnv().DB;
}

async function ensureLocalAgentTables() {
  await db().batch(localAgentSchema.map((statement) => db().prepare(statement)));
  const columns = await db().prepare("PRAGMA table_info(local_agent_jobs)").all<{ name: string }>();
  const names = new Set((columns.results ?? []).map((column) => column.name));
  const additions = [
    ["project_id", "ALTER TABLE local_agent_jobs ADD COLUMN project_id TEXT"],
    ["operation", "ALTER TABLE local_agent_jobs ADD COLUMN operation TEXT DEFAULT 'run_terminal_command' NOT NULL"],
    ["args_json", "ALTER TABLE local_agent_jobs ADD COLUMN args_json TEXT DEFAULT '{}' NOT NULL"],
    ["changed_files_json", "ALTER TABLE local_agent_jobs ADD COLUMN changed_files_json TEXT DEFAULT '[]' NOT NULL"],
  ] as const;
  for (const [name, statement] of additions) if (!names.has(name)) await db().prepare(statement).run();
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
  let changedFiles: Array<Record<string, unknown>> = [];
  try { changedFiles = JSON.parse(row.changed_files_json || "[]") as Array<Record<string, unknown>>; } catch { /* Ignore malformed optional worker metadata. */ }
  return {
    id: row.id,
    agentId: row.agent_id,
    projectId: row.project_id,
    operation: row.operation,
    command: row.command,
    cwd: row.cwd,
    status: row.status,
    stdout: row.stdout.slice(0, 8_000),
    stderr: row.stderr.slice(0, 8_000),
    exitCode: row.exit_code,
    changedFiles,
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
        projectId: job.project_id,
        operation: job.operation || "run_terminal_command",
        payload: JSON.parse(job.args_json || "{}") as Record<string, unknown>,
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
    const changedFiles = Array.isArray(payload.changedFiles) ? JSON.stringify(payload.changedFiles).slice(0, 30_000) : "[]";
    const status = payload.status === "timed_out" ? "timed_out" : exitCode === 0 ? "completed" : "failed";
    const completed = await db().prepare("UPDATE local_agent_jobs SET status=?, stdout=?, stderr=?, exit_code=?, changed_files_json=?, completed_at=? WHERE id=? AND agent_id=? AND owner_id=? AND status='running'")
      .bind(status, stdout, stderr, exitCode, changedFiles, now, jobId, agent.id, agent.owner_id).run();
    if (!completed.meta.changes) throw Object.assign(new Error("실행 중인 작업을 찾지 못했습니다."), { status: 409 });
    await db().prepare("UPDATE local_agents SET last_seen_at=? WHERE id=?").bind(now, agent.id).run();
    const finishedJob = await db().prepare("SELECT * FROM local_agent_jobs WHERE id=? AND agent_id=? AND owner_id=?")
      .bind(jobId, agent.id, agent.owner_id).first<JobRow>();
    if (finishedJob?.project_id) {
      const project = await db().prepare("SELECT * FROM workspace_projects WHERE id=? AND owner_id=?")
        .bind(finishedJob.project_id, agent.owner_id).first<WorkspaceProject>();
      if (project) await recordProjectActivity(project, {
        jobId,
        action: finishedJob.operation,
        path: String((JSON.parse(finishedJob.args_json || "{}") as Record<string, unknown>).path ?? "") || null,
        status,
        summary: status === "completed" ? `${finishedJob.command} 완료` : (stderr || `${finishedJob.command} 실패`).slice(0, 800),
      });
    }
    return { saved: true };
  }

  throw Object.assign(new Error("지원하지 않는 로컬 에이전트 작업입니다."), { status: 400 });
}

function projectTools(agent: AgentRow, project: WorkspaceProject) {
  const base = {
    kind: "local_shell" as const,
    connectionId: agent.id,
    connectionName: `${project.name} · ${agent.name}`,
    projectId: project.id,
  };
  const tools = [
    {
      ...base,
      alias: `project_list_${project.id.replace(/-/g, "").slice(0, 16)}`,
      toolName: "list_project_files",
      description: `[프로젝트 읽기 · 자동 실행 가능] ${project.name}의 파일 트리를 봅니다. 루트는 ${project.root_path}이며 그 밖에는 접근할 수 없습니다.`,
      inputSchema: { type: "object", properties: { path: { type: "string", description: "프로젝트 기준 상대 폴더. 기본값 ." }, maxDepth: { type: "integer", minimum: 1, maximum: 8 } }, additionalProperties: false },
      risk: "read" as const,
    },
    {
      ...base,
      alias: `project_read_${project.id.replace(/-/g, "").slice(0, 16)}`,
      toolName: "read_project_file",
      description: `[프로젝트 읽기 · 자동 실행 가능] ${project.name} 안의 텍스트 파일 하나를 읽습니다.`,
      inputSchema: { type: "object", properties: { path: { type: "string", description: "프로젝트 기준 파일 경로" } }, required: ["path"], additionalProperties: false },
      risk: "read" as const,
    },
    {
      ...base,
      alias: `project_search_${project.id.replace(/-/g, "").slice(0, 16)}`,
      toolName: "search_project_files",
      description: `[프로젝트 읽기 · 자동 실행 가능] ${project.name}의 파일명과 텍스트를 검색합니다.`,
      inputSchema: { type: "object", properties: { query: { type: "string" }, path: { type: "string" }, maxResults: { type: "integer", minimum: 1, maximum: 100 } }, required: ["query"], additionalProperties: false },
      risk: "read" as const,
    },
    {
      ...base,
      alias: `project_diff_${project.id.replace(/-/g, "").slice(0, 16)}`,
      toolName: "inspect_project_changes",
      description: `[프로젝트 읽기 · 자동 실행 가능] ${project.name}의 Git 상태와 diff를 확인합니다.`,
      inputSchema: { type: "object", properties: { path: { type: "string", description: "선택 경로. 기본값 전체 프로젝트" } }, additionalProperties: false },
      risk: "read" as const,
    },
  ];
  if (project.file_access === "read-write") tools.push({
    ...base,
    alias: `project_write_${project.id.replace(/-/g, "").slice(0, 16)}`,
    toolName: "write_project_file",
    description: `[프로젝트 변경 · 사용자 승인 필수] ${project.name} 안의 텍스트 파일을 만들거나 전체 내용을 교체합니다. 저장 전 대상 경로와 내용을 반드시 보여주세요.`,
    inputSchema: { type: "object", properties: { path: { type: "string" }, content: { type: "string" }, expectedHash: { type: "string", description: "동시 수정 방지용 이전 파일 SHA-256. 새 파일은 생략" } }, required: ["path", "content"], additionalProperties: false },
    risk: "write" as const,
  });
  if (project.command_access === "approval") tools.push({
    ...base,
    alias: `project_shell_${project.id.replace(/-/g, "").slice(0, 16)}`,
    toolName: "run_project_command",
    description: `[프로젝트 변경 · 사용자 승인 필수] ${project.name} 루트 안에서 빌드·테스트·Git·개발 명령을 실행합니다.`,
    inputSchema: { type: "object", properties: { command: { type: "string" }, cwd: { type: "string", description: "프로젝트 루트 기준 상대 경로" }, timeoutSeconds: { type: "integer", minimum: 1, maximum: 120 } }, required: ["command"], additionalProperties: false },
    risk: "write" as const,
  });
  return tools;
}

export async function connectedLocalAgentTools(request: Request, project: WorkspaceProject | null = null) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  const cutoff = new Date(Date.now() - AGENT_ONLINE_MS).toISOString();
  const agents = await db().prepare("SELECT * FROM local_agents WHERE owner_id=? AND revoked_at IS NULL AND last_seen_at >= ? ORDER BY last_seen_at DESC")
    .bind(owner, cutoff).all<AgentRow>();
  if (project) {
    const agent = agents.results.find((candidate) => candidate.id === project.agent_id);
    return agent ? projectTools(agent, project) : [];
  }
  return agents.results.map((agent) => ({
    alias: `local_shell_${agent.id.replace(/-/g, "").slice(0, 16)}`,
    kind: "local_shell" as const,
    connectionId: agent.id,
    connectionName: agent.name,
    projectId: null,
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

function safeRelativeJoin(root: string, child: string) {
  const normalized = child.replace(/\\/g, "/").trim() || ".";
  if (/^(?:[a-z]:|\/)/i.test(normalized) || normalized.split("/").some((part) => part === "..")) throw new Error("작업 경로는 프로젝트 안의 상대 경로여야 합니다.");
  return [root === "." ? "" : root, normalized === "." ? "" : normalized].filter(Boolean).join("/") || ".";
}

export async function runLocalAgentTool(request: Request, runId: string, agentId: string, operation: string, args: Record<string, unknown>, projectId?: string | null) {
  await ensureLocalAgentTables();
  const owner = ownerId(request);
  const cutoff = new Date(Date.now() - AGENT_ONLINE_MS).toISOString();
  const agent = await db().prepare("SELECT * FROM local_agents WHERE id=? AND owner_id=? AND revoked_at IS NULL AND last_seen_at >= ?")
    .bind(agentId, owner, cutoff).first<AgentRow>();
  if (!agent) throw new Error("로컬 에이전트가 오프라인입니다. 로컬 연결 화면에서 다시 실행해 주세요.");
  const allowed = ["run_terminal_command", "list_project_files", "read_project_file", "search_project_files", "inspect_project_changes", "write_project_file", "run_project_command"];
  if (!allowed.includes(operation)) throw new Error("지원하지 않는 로컬 프로젝트 작업입니다.");
  const project = projectId ? await requireWorkspaceProject(request, projectId) : null;
  if (project && project.agent_id !== agent.id) throw new Error("이 프로젝트에 연결된 컴퓨터가 아닙니다.");
  if (project && operation === "write_project_file" && project.file_access !== "read-write") throw new Error("이 프로젝트는 읽기 전용입니다.");
  if (project && operation === "run_project_command" && project.command_access !== "approval") throw new Error("이 프로젝트에서는 터미널 실행이 꺼져 있습니다.");
  if (!project && operation !== "run_terminal_command") throw new Error("프로젝트 범위가 필요한 로컬 작업입니다.");
  const command = String(args.command ?? "").trim();
  if ((operation === "run_terminal_command" || operation === "run_project_command") && (!command || command.length > MAX_COMMAND_LENGTH)) throw new Error("터미널 명령은 1자 이상 4,000자 이하여야 합니다.");
  if (operation === "write_project_file" && String(args.content ?? "").length > 600_000) throw new Error("한 번에 저장할 파일은 600KB 이하여야 합니다.");
  const cwd = project ? safeRelativeJoin(project.root_path, operation === "run_project_command" ? String(args.cwd ?? ".") : ".") : String(args.cwd ?? ".").trim().slice(0, 1_000) || ".";
  const timeoutSeconds = Math.min(120, Math.max(1, Number(args.timeoutSeconds ?? 30) || 30));
  const label = command || `${operation}: ${String(args.path ?? args.query ?? ".")}`;
  const argsJson = JSON.stringify(args);
  const id = crypto.randomUUID();
  await db().prepare("INSERT INTO local_agent_jobs (id, agent_id, owner_id, run_id, project_id, operation, args_json, command, cwd, timeout_seconds) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, agent.id, owner, runId, project?.id ?? null, operation, argsJson, label, cwd, timeoutSeconds).run();

  const waitUntil = Date.now() + Math.min(30_000, timeoutSeconds * 1_000 + 4_000);
  while (Date.now() < waitUntil) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const job = await db().prepare("SELECT * FROM local_agent_jobs WHERE id=? AND owner_id=?").bind(id, owner).first<JobRow>();
    if (job && !["queued", "running"].includes(job.status)) {
      const result = publicJob(job);
      if (project) await recordProjectActivity(project, { jobId: id, action: operation, path: String(args.path ?? args.cwd ?? "") || null, status: job.status, summary: job.status === "completed" ? `${label} 완료` : (job.stderr || `${label} 실패`).slice(0, 800) });
      return result;
    }
  }
  if (project) await recordProjectActivity(project, { jobId: id, action: operation, path: String(args.path ?? args.cwd ?? "") || null, status: "running", summary: `${label} 실행 중` });
  return { id, agentId: agent.id, projectId: project?.id ?? null, operation, command: label, cwd, status: "running", message: "작업을 로컬 컴퓨터에서 실행 중입니다. 프로젝트 활동에서 결과를 확인할 수 있습니다." };
}
