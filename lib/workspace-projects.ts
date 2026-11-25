import { ownerId } from "./mcp-hub";
import { runtimeEnv, type ModelPreference } from "./terracotta-router";

export type ProjectFileAccess = "read-only" | "read-write";
export type ProjectCommandAccess = "disabled" | "approval";

export type WorkspaceProject = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  agent_id: string | null;
  root_path: string;
  instructions: string;
  model_preference: ModelPreference;
  file_access: ProjectFileAccess;
  command_access: ProjectCommandAccess;
  color: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};

export type ProjectActivity = {
  id: string;
  project_id: string;
  owner_id: string;
  job_id: string | null;
  action: string;
  path: string | null;
  status: string;
  summary: string;
  created_at: string;
};

const projectSchema = [
  `CREATE TABLE IF NOT EXISTS workspace_projects (id TEXT PRIMARY KEY NOT NULL, owner_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT DEFAULT '' NOT NULL, agent_id TEXT, root_path TEXT DEFAULT '.' NOT NULL, instructions TEXT DEFAULT '' NOT NULL, model_preference TEXT DEFAULT 'latest' NOT NULL, file_access TEXT DEFAULT 'read-write' NOT NULL, command_access TEXT DEFAULT 'approval' NOT NULL, color TEXT DEFAULT '#78906f' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, archived_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS workspace_projects_owner_idx ON workspace_projects (owner_id, archived_at, updated_at)`,
  `CREATE TABLE IF NOT EXISTS project_file_events (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, owner_id TEXT NOT NULL, job_id TEXT, action TEXT NOT NULL, path TEXT, status TEXT NOT NULL, summary TEXT DEFAULT '' NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS project_file_events_project_idx ON project_file_events (project_id, owner_id, created_at)`,
];

const colors = ["#78906f", "#a56f52", "#6e8494", "#8d7896", "#a28c57", "#5f8f83"];
const preferences: ModelPreference[] = ["latest", "gpt", "claude", "gemini"];

function db() {
  return runtimeEnv().DB;
}

export async function ensureWorkspaceProjects() {
  await db().batch(projectSchema.map((statement) => db().prepare(statement)));
}

function clean(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeRootPath(value: unknown) {
  const root = clean(value, 1_000).replace(/\\/g, "/") || ".";
  if (/^(?:[a-z]:|\/)/i.test(root) || root.split("/").some((part) => part === "..")) {
    throw Object.assign(new Error("프로젝트 경로는 연결된 workspace 안의 상대 경로여야 합니다."), { status: 400, code: "INVALID_PROJECT_ROOT" });
  }
  return root.replace(/^\.\//, "").replace(/\/{2,}/g, "/").replace(/\/$/, "") || ".";
}

function projectError(message = "프로젝트를 찾을 수 없어요.") {
  return Object.assign(new Error(message), { status: 404, code: "PROJECT_NOT_FOUND" });
}

function preference(value: unknown): ModelPreference {
  return preferences.includes(value as ModelPreference) ? value as ModelPreference : "latest";
}

function fileAccess(value: unknown): ProjectFileAccess {
  return value === "read-only" ? "read-only" : "read-write";
}

function commandAccess(value: unknown): ProjectCommandAccess {
  return value === "disabled" ? "disabled" : "approval";
}

export async function listWorkspaceProjects(request: Request) {
  await ensureWorkspaceProjects();
  const result = await db().prepare("SELECT * FROM workspace_projects WHERE owner_id=? AND archived_at IS NULL ORDER BY updated_at DESC")
    .bind(ownerId(request)).all<WorkspaceProject>();
  return result.results ?? [];
}

export async function getWorkspaceProject(request: Request, projectId?: string | null, includeArchived = false) {
  if (!projectId) return null;
  await ensureWorkspaceProjects();
  const suffix = includeArchived ? "" : " AND archived_at IS NULL";
  return db().prepare(`SELECT * FROM workspace_projects WHERE id=? AND owner_id=?${suffix}`)
    .bind(projectId, ownerId(request)).first<WorkspaceProject>();
}

export async function requireWorkspaceProject(request: Request, projectId: string) {
  const project = await getWorkspaceProject(request, projectId);
  if (!project) throw projectError();
  return project;
}

export async function createWorkspaceProject(request: Request, input: Record<string, unknown>) {
  await ensureWorkspaceProjects();
  const name = clean(input.name, 80);
  if (!name) throw Object.assign(new Error("프로젝트 이름을 입력해 주세요."), { status: 400, code: "PROJECT_NAME_REQUIRED" });
  const id = crypto.randomUUID();
  const color = colors[Math.abs(name.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % colors.length];
  await db().prepare("INSERT INTO workspace_projects (id, owner_id, name, description, agent_id, root_path, instructions, model_preference, file_access, command_access, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id, ownerId(request), name, clean(input.description, 1_200), clean(input.agentId, 80) || null, normalizeRootPath(input.rootPath), clean(input.instructions, 8_000), preference(input.modelPreference), fileAccess(input.fileAccess), commandAccess(input.commandAccess), color).run();
  return requireWorkspaceProject(request, id);
}

export async function updateWorkspaceProject(request: Request, projectId: string, input: Record<string, unknown>) {
  const current = await requireWorkspaceProject(request, projectId);
  const name = clean(input.name ?? current.name, 80);
  if (!name) throw Object.assign(new Error("프로젝트 이름을 입력해 주세요."), { status: 400, code: "PROJECT_NAME_REQUIRED" });
  await db().prepare("UPDATE workspace_projects SET name=?, description=?, agent_id=?, root_path=?, instructions=?, model_preference=?, file_access=?, command_access=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
    .bind(
      name,
      clean(input.description ?? current.description, 1_200),
      clean(input.agentId ?? current.agent_id, 80) || null,
      normalizeRootPath(input.rootPath ?? current.root_path),
      clean(input.instructions ?? current.instructions, 8_000),
      preference(input.modelPreference ?? current.model_preference),
      fileAccess(input.fileAccess ?? current.file_access),
      commandAccess(input.commandAccess ?? current.command_access),
      current.id,
      current.owner_id,
    ).run();
  return requireWorkspaceProject(request, current.id);
}

export async function archiveWorkspaceProject(request: Request, projectId: string) {
  const project = await requireWorkspaceProject(request, projectId);
  await db().prepare("UPDATE workspace_projects SET archived_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?")
    .bind(project.id, project.owner_id).run();
  return { archived: true };
}

export async function projectActivities(request: Request, projectId: string, limit = 30) {
  const project = await requireWorkspaceProject(request, projectId);
  const result = await db().prepare("SELECT * FROM project_file_events WHERE project_id=? AND owner_id=? ORDER BY created_at DESC LIMIT ?")
    .bind(project.id, project.owner_id, Math.min(100, Math.max(1, limit))).all<ProjectActivity>();
  return result.results ?? [];
}

export async function recordProjectActivity(project: WorkspaceProject, event: { jobId?: string | null; action: string; path?: string | null; status: string; summary?: string }) {
  await ensureWorkspaceProjects();
  if (event.jobId) {
    const updated = await db().prepare("UPDATE project_file_events SET action=?, path=?, status=?, summary=? WHERE project_id=? AND owner_id=? AND job_id=?")
      .bind(clean(event.action, 80), clean(event.path, 1_000) || null, clean(event.status, 40), clean(event.summary, 2_000), project.id, project.owner_id, event.jobId).run();
    if (updated.meta.changes) {
      await db().prepare("UPDATE workspace_projects SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(project.id, project.owner_id).run();
      return;
    }
  }
  await db().prepare("INSERT INTO project_file_events (id, project_id, owner_id, job_id, action, path, status, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), project.id, project.owner_id, event.jobId ?? null, clean(event.action, 80), clean(event.path, 1_000) || null, clean(event.status, 40), clean(event.summary, 2_000)).run();
  await db().prepare("UPDATE workspace_projects SET updated_at=CURRENT_TIMESTAMP WHERE id=? AND owner_id=?").bind(project.id, project.owner_id).run();
}

export function projectContext(project: WorkspaceProject | null) {
  if (!project) return "";
  return [
    `[Terracotta project: ${project.name}]`,
    project.description ? `Goal: ${project.description}` : "",
    `Workspace root: ${project.root_path}`,
    `File access: ${project.file_access}; terminal: ${project.command_access}`,
    project.instructions ? `Project instructions:\n${project.instructions}` : "",
  ].filter(Boolean).join("\n");
}
