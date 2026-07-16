import { routeError, runAssistant, type ModelPreference } from "../../../lib/terracotta-router";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { prompt?: string; preference?: ModelPreference };
    const prompt = payload.prompt?.trim() ?? "";
    const preference = payload.preference && ["latest", "gpt", "claude"].includes(payload.preference) ? payload.preference : "latest";
    if (!prompt) return Response.json({ error: "prompt is required" }, { status: 400 });
    if (prompt.length > 20_000) return Response.json({ error: "prompt is too long" }, { status: 413 });
    return Response.json(await runAssistant(prompt, preference));
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
