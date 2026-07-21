import { env } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET() {
  const runtimeEnv = env as typeof env & {
    DB: D1Database;
    TERRACOTTA_SELF_HOSTED?: string;
  };

  try {
    const result = await runtimeEnv.DB.prepare("SELECT 1 AS value").first<{ value: number }>();
    if (result?.value !== 1) throw new Error("D1 readiness query failed");

    return Response.json(
      {
        status: "ok",
        database: "ok",
        deployment:
          runtimeEnv.TERRACOTTA_SELF_HOSTED === "true" ? "self-hosted" : "cloud",
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
