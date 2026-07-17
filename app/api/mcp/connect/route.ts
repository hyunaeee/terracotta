import { mcpError, startMcpConnection } from "../../../../lib/mcp-hub";
export async function POST(request: Request) {
  try { const payload = await request.json() as { id?: string }; if (!payload.id) return Response.json({ error: "id is required" }, { status: 400 }); return Response.json(await startMcpConnection(request, payload.id)); }
  catch (error) { return Response.json(mcpError(error), { status: 400 }); }
}
