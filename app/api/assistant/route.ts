import { resolveApproval, runAssistant } from "../../../lib/terracotta-orchestrator";
import { routeError, type ModelPreference } from "../../../lib/terracotta-router";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { prompt?: string; preference?: ModelPreference; approvalId?: string; decision?: "approve" | "reject" };
    if (payload.approvalId && (payload.decision === "approve" || payload.decision === "reject")) {
      const result = await resolveApproval(request, payload.approvalId, payload.decision);
      return Response.json(result, { status: result.approvalRequired ? 202 : 200 });
    }
    const prompt = payload.prompt?.trim() ?? "";
    const preference = payload.preference && ["latest", "gpt", "claude"].includes(payload.preference) ? payload.preference : "latest";
    if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
    if (prompt.length > 20_000) return Response.json({ error: "prompt is too long" }, { status: 413 });
    const result = await runAssistant(request, prompt, preference);
    return Response.json(result, { status: result.approvalRequired ? 202 : 200 });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
