import {
  acceptTeamHandoff,
  createWorkSession,
  getWorkContext,
  handoffWorkSession,
  revokeWorkSessionMember,
  shareWorkSession,
  type SessionRole,
} from "../../../lib/work-context";
import { routeError } from "../../../lib/terracotta-router";

function providerLabel(provider: string | null) {
  if (provider === "openai") return "GPT";
  if (provider === "anthropic") return "Claude";
  if (provider === "perplexity") return "Perplexity";
  return null;
}

async function contextPayload(request: Request, sessionId?: string | null) {
  const context = await getWorkContext(request, sessionId);
  return {
    currentUser: context.currentUser,
    session: context.session ? {
      id: context.session.id,
      title: context.session.title,
      goal: context.session.goal,
      ownerEmail: context.session.owner_id,
      role: context.session.access_role,
      lastProvider: context.session.last_provider,
      lastModel: context.session.last_model_id,
    } : null,
    messages: context.turns.map((turn) => ({
      role: turn.role,
      text: turn.content,
      author: turn.owner_id,
      ...(turn.model_id ? { models: `${turn.model_id} · ${providerLabel(turn.provider)}` } : {}),
    })),
    members: context.members,
    handoffs: context.handoffs.map((handoff) => ({
      id: handoff.id,
      fromEmail: handoff.from_email,
      toEmail: handoff.to_email,
      note: handoff.note,
      status: handoff.status,
      createdAt: handoff.created_at,
    })),
    recentSessions: context.recentSessions.map((session) => ({
      id: session.id,
      title: session.title,
      ownerEmail: session.owner_id,
      role: session.access_role,
      lastProvider: session.last_provider,
      updatedAt: session.updated_at,
    })),
  };
}

export async function GET(request: Request) {
  try {
    const sessionId = new URL(request.url).searchParams.get("sessionId");
    return Response.json(await contextPayload(request, sessionId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as {
      action?: "new" | "share" | "handoff" | "revoke" | "accept";
      sessionId?: string;
      title?: string;
      email?: string;
      role?: Exclude<SessionRole, "owner">;
      note?: string;
      handoffId?: string;
    };
    if (payload.action === "new") {
      const session = await createWorkSession(request, payload.title);
      return Response.json(await contextPayload(request, session.id), { status: 201 });
    }
    if (!payload.sessionId) return Response.json({ error: "sessionId is required" }, { status: 400 });
    if (payload.action === "share" && payload.email && payload.role) {
      await shareWorkSession(request, payload.sessionId, payload.email, payload.role, payload.note);
    } else if (payload.action === "handoff" && payload.email) {
      await handoffWorkSession(request, payload.sessionId, payload.email, payload.note ?? "");
    } else if (payload.action === "revoke" && payload.email) {
      await revokeWorkSessionMember(request, payload.sessionId, payload.email);
    } else if (payload.action === "accept" && payload.handoffId) {
      await acceptTeamHandoff(request, payload.sessionId, payload.handoffId);
    } else {
      return Response.json({ error: "unsupported context action" }, { status: 400 });
    }
    return Response.json(await contextPayload(request, payload.sessionId), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
