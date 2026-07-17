import { addCustomMcp, configureMcpOAuthApp, listMcpConnections, mcpError, removeMcpConnection } from "../../../lib/mcp-hub";

export async function GET(request: Request) {
  try { return Response.json({ connections: await listMcpConnections(request) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return Response.json(mcpError(error), { status: 500 }); }
}
export async function POST(request: Request) {
  try { return Response.json(await addCustomMcp(request, await request.json() as { name?: string; url?: string }), { status: 201 }); }
  catch (error) { return Response.json(mcpError(error), { status: 400 }); }
}
export async function PATCH(request: Request) {
  try { return Response.json(await configureMcpOAuthApp(request, await request.json() as { id?: string; clientId?: string; clientSecret?: string })); }
  catch (error) { return Response.json(mcpError(error), { status: 400 }); }
}
export async function DELETE(request: Request) {
  try { const id = new URL(request.url).searchParams.get("id") ?? ""; await removeMcpConnection(request, id); return Response.json({ removed: true }); }
  catch (error) { return Response.json(mcpError(error), { status: 400 }); }
}
