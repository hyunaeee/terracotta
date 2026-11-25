import { handleLocalAgentRequest } from "../../../../lib/local-agent";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    return Response.json(await handleLocalAgentRequest(request, payload), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? Number(error.status) : 500;
    return Response.json({ error: error instanceof Error ? error.message : "로컬 에이전트 요청을 처리하지 못했습니다." }, { status });
  }
}
