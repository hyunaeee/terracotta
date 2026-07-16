import { getRegistrySnapshot, routeError, savePreference, syncProviderRegistry, type ModelPreference } from "../../../lib/terracotta-router";

export async function GET(request: Request) {
  try {
    const force = new URL(request.url).searchParams.get("refresh") === "1";
    if (force) await syncProviderRegistry(true);
    return Response.json(await getRegistrySnapshot(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { preference?: ModelPreference };
    if (!payload.preference || !["latest", "gpt", "claude"].includes(payload.preference)) return Response.json({ error: "valid preference is required" }, { status: 400 });
    await savePreference(payload.preference);
    return Response.json({ saved: true });
  } catch (error) {
    const routed = routeError(error);
    return Response.json(routed.body, { status: routed.status });
  }
}
