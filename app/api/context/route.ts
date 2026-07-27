import { createWorkSession, getWorkContext } from "../../../lib/work-context";
import { routeError } from "../../../lib/terracotta-router";

function providerLabel(provider: string | null) {
  if (provider === "openai") return "GPT";
  if (provider === "anthropic") return "Claude";
  if (provider === "perplexity") return "Perplexity";
  return null;
}

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    const context = await getWorkContext(request, sessionId);
    return Response.json({
      session: context.session ? {
        id: context.session.id,
        title: context.session.title,
        goal: context.session.goal,
        lastProvider: context.session.last_provider,
        lastModel: context.session.last_model_id,
      } : null,
      messages: context.turns.map((turn) => ({
        role: turn.role,
        text: turn.content,
        ...(turn.model_id ? { models: `${turn.model_id} · ${providerLabel(turn.provider)}` } : {}),
      })),
      recentSessions: context.recentSessions.map((session) => ({
        id: session.id,
        title: session.title,
        lastProvider: session.last_provider,
        updatedAt: session.updated_at,
      })),
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { action?: string; title?: string };
    if (payload.action !== "new") return Response.json({ error: "unsupported context action" }, { status: 400 });
    const session = await createWorkSession(request, payload.title);
    return Response.json({ session: { id: session.id, title: session.title, lastProvider: null }, messages: [] }, { status: 201 });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
