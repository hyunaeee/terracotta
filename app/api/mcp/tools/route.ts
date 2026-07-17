import { callMcpTool, mcpError } from "../../../../lib/mcp-hub";
export async function POST(request: Request) {
  try { const payload = await request.json() as { id?: string; tool?: string; arguments?: Record<string, unknown> }; if (!payload.id || !payload.tool) return Response.json({ error: "id and tool are required" }, { status: 400 }); return Response.json({ result: await callMcpTool(request, payload.id, payload.tool, payload.arguments ?? {}) }); }
  catch (error) { return Response.json(mcpError(error), { status: 400 }); }
}
