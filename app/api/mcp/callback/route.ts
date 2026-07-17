import { finishMcpOAuth } from "../../../../lib/mcp-hub";
export async function GET(request: Request) {
  try { await finishMcpOAuth(request); return Response.redirect(new URL("/?mcp=connected", request.url)); }
  catch (error) { const url = new URL("/", request.url); url.searchParams.set("mcp", "error"); url.searchParams.set("message", error instanceof Error ? error.message.slice(0, 120) : "connection failed"); return Response.redirect(url); }
}
