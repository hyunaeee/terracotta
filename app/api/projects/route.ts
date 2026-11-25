import { localAgentDashboard } from "../../../lib/local-agent";
import { routeError } from "../../../lib/terracotta-router";
import {
  archiveWorkspaceProject,
  createWorkspaceProject,
  listWorkspaceProjects,
  projectActivities,
  requireWorkspaceProject,
  updateWorkspaceProject,
} from "../../../lib/workspace-projects";

function publicProject(project: Awaited<ReturnType<typeof requireWorkspaceProject>>) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    agentId: project.agent_id,
    rootPath: project.root_path,
    instructions: project.instructions,
    modelPreference: project.model_preference,
    fileAccess: project.file_access,
    commandAccess: project.command_access,
    color: project.color,
    updatedAt: project.updated_at,
  };
}

export async function GET(request: Request) {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId");
    const [projects, dashboard] = await Promise.all([listWorkspaceProjects(request), localAgentDashboard(request)]);
    const project = projectId ? await requireWorkspaceProject(request, projectId) : null;
    return Response.json({
      projects: projects.map(publicProject),
      agents: dashboard.agents,
      project: project ? publicProject(project) : null,
      activities: project ? await projectActivities(request, project.id) : [],
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown> & { action?: "create" | "update" | "archive"; projectId?: string };
    if (payload.action === "archive" && payload.projectId) return Response.json(await archiveWorkspaceProject(request, payload.projectId));
    const project = payload.action === "update" && payload.projectId
      ? await updateWorkspaceProject(request, payload.projectId, payload)
      : await createWorkspaceProject(request, payload);
    return Response.json({ project: publicProject(project) }, { status: payload.action === "update" ? 200 : 201 });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
