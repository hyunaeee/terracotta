import { mcpClientMetadata } from "../../../../lib/mcp-hub";
export async function GET(request: Request) { return Response.json(mcpClientMetadata(request), { headers: { "Cache-Control": "public, max-age=3600" } }); }
