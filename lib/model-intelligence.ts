export type ArenaCategory = "text" | "agent" | "webdev" | "vision" | "search" | "video";

export type ArenaMetric = {
  category: ArenaCategory;
  rank: number;
  score: number;
  scoreLabel: string;
  sampleCount: number;
  publishedAt: string;
  modelName: string;
};

export type ModelInsight = {
  id: string;
  name: string;
  provider: string;
  mark: string;
  availability: "router" | "watchlist" | "creative";
  summary: string;
  categories: string[];
  bestFor: string[];
  strengths: string[];
  weaknesses: string[];
  context: string;
  price: string;
  intelligenceIndex: number | null;
  intelligenceNote: string | null;
  officialUrl: string;
  arena: Partial<Record<ArenaCategory, ArenaMetric>>;
};

type ArenaRow = {
  model_name?: string;
  organization?: string;
  rating?: number;
  score?: number;
  vote_count?: number;
  session_count?: number;
  rank?: number;
  category?: string;
  leaderboard_publish_date?: string;
};

type Profile = Omit<ModelInsight, "arena"> & {
  aliases: RegExp[];
  fallbackArena: Partial<Record<ArenaCategory, ArenaMetric>>;
};

const ARENA_DATASET = "https://datasets-server.huggingface.co/rows?dataset=lmarena-ai%2Fleaderboard-dataset&split=latest&offset=0&length=100&config=";
const ARENA_CONFIGS: Record<ArenaCategory, string> = {
  text: "text",
  agent: "agent",
  webdev: "webdev",
  vision: "vision",
  search: "search",
  video: "text_to_video",
};

function fallbackMetric(category: ArenaCategory, rank: number, score: number, sampleCount: number, modelName: string, publishedAt: string, percent = false): ArenaMetric {
  return { category, rank, score, scoreLabel: percent ? `${score.toFixed(2)}%` : Math.round(score).toLocaleString("en-US"), sampleCount, modelName, publishedAt };
}

const profiles: Profile[] = [
  {
    id: "claude-fable-5",
    name: "Claude Fable 5",
    provider: "Anthropic",
    mark: "F",
    availability: "router",
    summary: "긴 호흡의 에이전트 작업과 고난도 지식·코딩 작업을 끝까지 밀어붙이는 최상위 모델.",
    categories: ["전체", "코딩", "에이전트", "문서", "비전"],
    bestFor: ["대규모 리팩터링", "장기 에이전트", "복잡한 문서", "고충실도 UI"],
    strengths: ["Agent Arena와 Vision Arena 최상위권", "단계가 많은 작업을 스스로 계획·검증", "코드·표·차트·PDF를 함께 다루는 능력"],
    weaknesses: ["입출력 단가가 가장 높은 편", "일부 보안·생물학 요청은 Opus 4.8로 우회", "가벼운 대화에는 과한 추론 비용"],
    context: "장기 컨텍스트",
    price: "$10 입력 · $50 출력 / 1M",
    intelligenceIndex: 60,
    intelligenceNote: "AA Intelligence Index · max effort",
    officialUrl: "https://www.anthropic.com/claude/fable",
    aliases: [/claude[- ]fable[- ]5/i],
    fallbackArena: {
      text: fallbackMetric("text", 3, 1493, 8817, "claude-fable-5", "2026-07-16"),
      agent: fallbackMetric("agent", 1, 13.94, 16059, "Claude Fable 5 (High)", "2026-07-13", true),
      webdev: fallbackMetric("webdev", 2, 1631, 2505, "claude-fable-5", "2026-07-16"),
      vision: fallbackMetric("vision", 1, 1335, 4383, "claude-fable-5", "2026-07-12"),
      search: fallbackMetric("search", 4, 1230, 9895, "claude-fable-5", "2026-07-14"),
    },
  },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    provider: "OpenAI",
    mark: "G",
    availability: "router",
    summary: "복잡한 추론·코딩과 폭넓은 도구 사용을 균형 있게 처리하는 OpenAI의 플래그십 모델.",
    categories: ["전체", "코딩", "에이전트", "추론"],
    bestFor: ["복잡한 추론", "Codex 작업", "도구 연결", "대용량 컨텍스트"],
    strengths: ["1.05M 컨텍스트와 128K 최대 출력", "코딩·웹개발 아레나 상위권", "웹·파일·컴퓨터·MCP 도구를 폭넓게 지원"],
    weaknesses: ["Terra·Luna보다 비용이 높음", "최고 노력 모드는 응답 시간이 길어질 수 있음", "Text Arena와 실제 에이전트 성능의 순위 차이가 큼"],
    context: "1.05M context",
    price: "$5 입력 · $30 출력 / 1M",
    intelligenceIndex: 59,
    intelligenceNote: "AA Intelligence Index · max effort",
    officialUrl: "https://developers.openai.com/api/docs/models/gpt-5.6-sol",
    aliases: [/gpt[- ]?5\.6[- ]sol/i],
    fallbackArena: {
      text: fallbackMetric("text", 26, 1457, 4113, "gpt-5.6-sol-xhigh", "2026-07-16"),
      agent: fallbackMetric("agent", 2, 10.94, 7881, "GPT 5.6 Sol (xHigh)", "2026-07-13", true),
      webdev: fallbackMetric("webdev", 3, 1618, 2542, "gpt-5.6-sol-xhigh (codex-harness)", "2026-07-16"),
    },
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    provider: "Moonshot AI",
    mark: "K",
    availability: "watchlist",
    summary: "최근 WebDev Arena에서 두각을 보인 신흥 프런티어 모델. Terracotta 연결 후보로 추적 중.",
    categories: ["전체", "코딩", "관심 모델"],
    bestFor: ["웹앱 제작", "프런트엔드", "비용 대비 성능 실험"],
    strengths: ["WebDev Arena 현재 최상위권", "Artificial Analysis 지능 지표 57", "새로운 코드 생성 경쟁 모델"],
    weaknesses: ["Terracotta에 아직 공급사 연결 없음", "신규 모델이라 장기 안정성 데이터가 적음", "Text Arena와 WebDev Arena 성적 차이가 있음"],
    context: "공급사 확인 필요",
    price: "연결 전",
    intelligenceIndex: 57,
    intelligenceNote: "AA Intelligence Index",
    officialUrl: "https://www.moonshot.ai/",
    aliases: [/kimi[- ]k3/i],
    fallbackArena: {
      text: fallbackMetric("text", 12, 1473, 3026, "kimi-k3", "2026-07-16"),
      webdev: fallbackMetric("webdev", 1, 1679, 1757, "kimi-k3", "2026-07-16"),
    },
  },
  {
    id: "glm-5.2",
    name: "GLM-5.2 Max",
    provider: "Z.ai",
    mark: "Z",
    availability: "watchlist",
    summary: "오픈 웨이트 계열 중 높은 지능 지표와 웹개발 성능을 보이는 관심 모델.",
    categories: ["전체", "코딩", "오픈 모델", "관심 모델"],
    bestFor: ["웹개발", "자체 호스팅 검토", "오픈 모델 비교"],
    strengths: ["WebDev Arena 상위권", "Artificial Analysis 오픈 웨이트 선두권", "MIT 라이선스 모델 계열"],
    weaknesses: ["일반 Text Arena는 코딩 순위보다 낮음", "호스팅 환경에 따라 속도·품질 편차", "Terracotta에 아직 공급사 연결 없음"],
    context: "오픈 웨이트",
    price: "호스팅별 상이",
    intelligenceIndex: 51,
    intelligenceNote: "AA Intelligence Index",
    officialUrl: "https://z.ai/",
    aliases: [/glm[- ]5\.2/i],
    fallbackArena: {
      text: fallbackMetric("text", 21, 1463, 15656, "glm-5.2 (max)", "2026-07-16"),
      agent: fallbackMetric("agent", 9, 6.24, 31993, "GLM 5.2 (Max)", "2026-07-13", true),
      webdev: fallbackMetric("webdev", 4, 1587, 4722, "glm-5.2 (max)", "2026-07-16"),
    },
  },
  {
    id: "claude-sonnet-5",
    name: "Claude Sonnet 5",
    provider: "Anthropic",
    mark: "C",
    availability: "router",
    summary: "속도와 비용을 낮추면서 에이전트·문서·일상 코딩을 맡기기 좋은 실무형 Claude.",
    categories: ["전체", "코딩", "에이전트", "문서"],
    bestFor: ["일상 코딩", "문서 작성", "빠른 에이전트", "검토"],
    strengths: ["Agent Arena 상위권", "Fable보다 빠르고 저렴한 실무 선택", "코딩·문서·도구 사용의 균형"],
    weaknesses: ["최고 난도 장기 작업은 Fable보다 약함", "Text·Vision Arena 순위는 Fable보다 낮음", "프로모션 종료 후 가격 변동 가능"],
    context: "실무 장문",
    price: "$2 입력 · $10 출력 / 1M*",
    intelligenceIndex: null,
    intelligenceNote: null,
    officialUrl: "https://www.anthropic.com/news/claude-sonnet-5",
    aliases: [/claude[- ]sonnet[- ]5/i],
    fallbackArena: {
      text: fallbackMetric("text", 49, 1442, 11176, "claude-sonnet-5-high", "2026-07-16"),
      agent: fallbackMetric("agent", 5, 8.00, 23640, "Claude Sonnet 5 (High)", "2026-07-13", true),
      webdev: fallbackMetric("webdev", 10, 1542, 2959, "claude-sonnet-5-high", "2026-07-16"),
      vision: fallbackMetric("vision", 21, 1275, 4103, "claude-sonnet-5-high", "2026-07-12"),
      search: fallbackMetric("search", 13, 1188, 11399, "claude-sonnet-5-search", "2026-07-14"),
    },
  },
  {
    id: "sonar-pro",
    name: "Perplexity Sonar Pro",
    provider: "Perplexity",
    mark: "P",
    availability: "router",
    summary: "최신 웹 자료를 넓게 검색하고 출처가 달린 답을 만드는 리서치 전용 모델.",
    categories: ["전체", "리서치", "검색"],
    bestFor: ["최신 정보", "출처 조사", "시장 리서치", "복합 검색"],
    strengths: ["200K 검색 컨텍스트", "표준 Sonar보다 2배 많은 검색 결과", "답변과 함께 출처를 제공"],
    weaknesses: ["비추론 모델이라 순수 수학·코딩에는 부적합", "토큰 비용 외 검색 요청 비용 발생", "아레나 순위가 검색 설정에 민감"],
    context: "200K context",
    price: "$3 입력 · $15 출력 / 1M + 검색",
    intelligenceIndex: null,
    intelligenceNote: null,
    officialUrl: "https://docs.perplexity.ai/docs/sonar/models/sonar-pro",
    aliases: [/ppl[- ]sonar[- ]pro/i, /perplexity[- ]sonar[- ]pro/i],
    fallbackArena: {
      search: fallbackMetric("search", 17, 1183, 12521, "ppl-sonar-pro-high", "2026-07-14"),
    },
  },
  {
    id: "higgsfield",
    name: "Higgsfield",
    provider: "Higgsfield",
    mark: "H",
    availability: "creative",
    summary: "텍스트 모델과 직접 경쟁하기보다 이미지·영상 제작 단계에서 사용하는 창작 전용 도구.",
    categories: ["전체", "비전", "영상"],
    bestFor: ["이미지 생성", "영상 생성", "광고 콘티", "모션 실험"],
    strengths: ["이미지와 영상을 한 제작 흐름에서 처리", "계정 인증 MCP로 창작 도구 연결", "텍스트 모델 결과를 시각물로 확장"],
    weaknesses: ["Text·Agent Arena와 직접 비교할 수 없음", "생성 크레딧 비용이 큼", "현재 공식 Arena 데이터에서 모델명이 매칭되지 않음"],
    context: "창작 크레딧",
    price: "생성 크레딧 기반",
    intelligenceIndex: null,
    intelligenceNote: null,
    officialUrl: "https://higgsfield.ai/",
    aliases: [/higgsfield/i],
    fallbackArena: {},
  },
];

async function fetchArena(category: ArenaCategory) {
  const response = await fetch(`${ARENA_DATASET}${ARENA_CONFIGS[category]}`, {
    headers: { Accept: "application/json", "User-Agent": "Terracotta-Model-Intelligence/1.0" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new Error(`Arena ${category} returned ${response.status}`);
  const payload = await response.json() as { rows?: Array<{ row?: ArenaRow }> };
  return (payload.rows ?? []).map((item) => item.row).filter((item): item is ArenaRow => Boolean(item?.model_name));
}

function liveMetric(category: ArenaCategory, row: ArenaRow): ArenaMetric | null {
  const rank = Number(row.rank);
  const rawScore = row.score == null ? Number(row.rating) : Number(row.score) * 100;
  if (!Number.isFinite(rank) || !Number.isFinite(rawScore)) return null;
  const percent = row.score != null;
  return {
    category,
    rank,
    score: Number(rawScore.toFixed(2)),
    scoreLabel: percent ? `${rawScore.toFixed(2)}%` : Math.round(rawScore).toLocaleString("en-US"),
    sampleCount: Number(row.session_count ?? row.vote_count ?? 0),
    publishedAt: row.leaderboard_publish_date ?? new Date().toISOString().slice(0, 10),
    modelName: row.model_name ?? "",
  };
}

function findBestRow(rows: ArenaRow[], profile: Profile) {
  return rows
    .filter((row) => profile.aliases.some((matcher) => matcher.test(row.model_name ?? "")))
    .sort((a, b) => Number(a.rank ?? 999) - Number(b.rank ?? 999) || Number(b.rating ?? b.score ?? 0) - Number(a.rating ?? a.score ?? 0))[0];
}

export async function getModelIntelligence() {
  const categories = Object.keys(ARENA_CONFIGS) as ArenaCategory[];
  const settled = await Promise.allSettled(categories.map(async (category) => [category, await fetchArena(category)] as const));
  const liveRows = new Map<ArenaCategory, ArenaRow[]>();
  for (const result of settled) if (result.status === "fulfilled") liveRows.set(result.value[0], result.value[1]);

  const models: ModelInsight[] = profiles.map(({ aliases: _aliases, fallbackArena, ...profile }) => {
    const arena = { ...fallbackArena };
    for (const category of categories) {
      const row = findBestRow(liveRows.get(category) ?? [], { ...profile, aliases: _aliases, fallbackArena });
      const metric = row ? liveMetric(category, row) : null;
      if (metric) arena[category] = metric;
    }
    return { ...profile, arena };
  });

  const dates = models.flatMap((model) => Object.values(model.arena).map((metric) => metric?.publishedAt).filter(Boolean) as string[]).sort();
  return {
    updatedAt: dates.at(-1) ?? new Date().toISOString().slice(0, 10),
    liveArena: liveRows.size > 0,
    models,
    sources: [
      { name: "Arena.ai", note: "사람의 블라인드 선호와 에이전트 결과", url: "https://arena.ai/leaderboard" },
      { name: "Arena dataset", note: "카테고리별 공개 최신 스냅샷", url: "https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset" },
      { name: "Artificial Analysis", note: "지능·가격·속도 복합 비교", url: "https://artificialanalysis.ai/leaderboards/models" },
    ],
    caveat: "순위는 프롬프트, 추론 노력, 도구 환경과 표본 수에 따라 달라집니다. Terracotta는 한 지표만으로 모델을 자동 선택하지 않습니다.",
  };
}
