import { getModelIntelligence } from "@/lib/model-intelligence";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getModelIntelligence(), {
      headers: { "Cache-Control": "public, max-age=300, s-maxage=21600, stale-while-revalidate=86400" },
    });
  } catch {
    return Response.json({ error: "모델 평가 정보를 불러오지 못했어요." }, { status: 503 });
  }
}
