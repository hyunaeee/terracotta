import { createLocalAgent, localAgentDashboard, revokeLocalAgent } from "../../../lib/local-agent";

function errorResponse(error: unknown) {
  const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
  return Response.json({ error: error instanceof Error ? error.message : "로컬 에이전트 요청을 처리하지 못했어요." }, { status });
}

export async function GET(request: Request) {
  try {
    return Response.json(await localAgentDashboard(request), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { action?: string; name?: string; id?: string };
    if (payload.action === "revoke") return Response.json(await revokeLocalAgent(request, payload.id ?? ""));
    return Response.json(await createLocalAgent(request, payload.name), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
