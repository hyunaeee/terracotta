import { runLocalAgentTool } from "../../../../lib/local-agent";
import { routeError } from "../../../../lib/terracotta-router";
import { requireWorkspaceProject } from "../../../../lib/workspace-projects";

const operations = {
  list: "list_project_files",
  read: "read_project_file",
  search: "search_project_files",
  diff: "inspect_project_changes",
  write: "write_project_file",
} as const;

function parseOutput(value: unknown) {
  if (!value || typeof value !== "object" || !("stdout" in value)) return null;
  try { return JSON.parse(String(value.stdout || "{}")) as unknown; } catch { return null; }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown> & { projectId?: string; action?: keyof typeof operations; confirmed?: boolean };
    if (!payload.projectId || !payload.action || !operations[payload.action]) return Response.json({ error: "projectId and a valid action are required" }, { status: 400 });
    if (payload.action === "write" && payload.confirmed !== true) return Response.json({ error: "파일 저장 확인이 필요합니다.", code: "WRITE_CONFIRMATION_REQUIRED" }, { status: 409 });
    const project = await requireWorkspaceProject(request, payload.projectId);
    if (!project.agent_id) return Response.json({ error: "이 프로젝트에 연결된 컴퓨터가 없습니다.", code: "PROJECT_AGENT_REQUIRED" }, { status: 409 });
    const args = { ...payload };
    delete args.projectId; delete args.action; delete args.confirmed;
    const job = await runLocalAgentTool(request, `project-ui:${crypto.randomUUID()}`, project.agent_id, operations[payload.action], args, project.id);
    const output = parseOutput(job);
    return Response.json({ job, output }, { status: "status" in job && job.status === "running" ? 202 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
