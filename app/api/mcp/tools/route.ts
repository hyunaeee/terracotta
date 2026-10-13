import { callMcpTool } from "../../../../lib/mcp-hub";
import { routeError } from "../../../../lib/terracotta-router";
export async function POST(request: Request) {
  try { const payload = await request.json() as { id?: string; tool?: string; arguments?: Record<string, unknown> }; if (!payload.id || !payload.tool) return Response.json({ error: "id and tool are required" }, { status: 400 }); return Response.json({ result: await callMcpTool(request, payload.id, payload.tool, payload.arguments ?? {}) }); }
  catch (error) { const routed = routeError(error); return Response.json(routed.body, { status: routed.status === 500 ? 400 : routed.status }); }
}
