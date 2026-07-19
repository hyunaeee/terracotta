"use client";

import { FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ArenaCategory, ModelInsight } from "@/lib/model-intelligence";

const quickPrompts = [
  "오늘 회의 내용을 정리해줘",
  "이번 주에 배운 것을 복습해줘",
  "새 프로젝트 아이디어를 같이 생각해줘",
];

type ModelPreference = "latest" | "gpt" | "claude";
type RegistryStatus = {
  syncIntervalHours: number;
  latestPrimary: { provider: string; model: string; modelId: string; source: string } | null;
  models: Array<{ provider: string; modelId: string; name: string; source: string }>;
  connections: Array<{ provider: string; status: string; model: string | null; lastSyncedAt: string | null; error: string | null; configured: boolean }>;
  monthlyUsage: { calls: number; costUsd: number; budgetUsd: number };
};

type ModelIntelligencePayload = {
  updatedAt: string;
  liveArena: boolean;
  models: ModelInsight[];
  sources: Array<{ name: string; note: string; url: string }>;
  caveat: string;
};

const modelInsightFilters = ["전체", "코딩", "에이전트", "리서치", "비전", "관심 모델"];
const arenaMetricOrder: Array<{ id: ArenaCategory; label: string }> = [
  { id: "text", label: "Text" },
  { id: "agent", label: "Agent" },
  { id: "webdev", label: "WebDev" },
  { id: "vision", label: "Vision" },
  { id: "search", label: "Search" },
  { id: "video", label: "Video" },
];

const modelCatalog = [
  { id: "gpt", provider: "openai", mark: "G", name: "GPT-5.6 Sol", role: "주 추론 · 코딩" },
  { id: "fable", provider: "anthropic", mark: "F", name: "Claude Fable 5", role: "최고 난도 · 장기 에이전트" },
  { id: "claude", provider: "anthropic", mark: "C", name: "Claude Sonnet 5", role: "빠른 에이전트 · 문서" },
  { id: "perplexity", provider: "perplexity", mark: "P", name: "Perplexity Sonar Pro", role: "웹 검색 · 리서치" },
  { id: "higgsfield", provider: "higgsfield", mark: "H", name: "Higgsfield", role: "이미지 · 영상" },
];

const preferenceOptions: { id: ModelPreference; title: string; description: string }[] = [
  { id: "latest", title: "최신 모델 우선", description: "공식 최신 목록이 바뀌면 GPT와 Claude의 순서를 자동으로 바꿔요." },
  { id: "gpt", title: "GPT 우선", description: "GPT를 먼저 쓰고, 필요할 때 Claude가 검토하거나 이어받아요." },
  { id: "claude", title: "Claude 우선", description: "Claude를 먼저 쓰고, 필요할 때 GPT가 검토하거나 이어받아요." },
];

const subscriptionPlans = [
  { name: "Seed", price: "24,900", credits: "3,000", cost: "약 $8", description: "개인용 가벼운 시작", examples: "짧은 대화 중심 · 가끔 검색/생성" },
  { name: "Grow", price: "59,000", credits: "10,000", cost: "약 $24", description: "매일 쓰는 기본 플랜", examples: "업무 대화 · 리서치 · 영상 초안", recommended: true },
  { name: "Canopy", price: "119,000", credits: "25,000", cost: "약 $55", description: "깊은 작업과 제작", examples: "긴 문서 · 심층 검색 · 반복 생성" },
  { name: "Studio", price: "239,000", credits: "60,000", cost: "약 $115", description: "크리에이터 집중 사용", examples: "대량 에이전트 작업 · 영상 제작" },
];

const grassShop = [
  { id: "grass-sage", name: "새싹 잔디", asset: "/assets/garden/grass-sage.png", connectedAsset: "/assets/garden/grass-sage-connected.png", cost: 45, color: "#90b65a" },
  { id: "grass-clover", name: "클로버 잔디", asset: "/assets/garden/grass-clover.png", connectedAsset: "/assets/garden/grass-clover-connected.png", cost: 55, color: "#68a75c" },
  { id: "grass-mint", name: "민트 잔디", asset: "/assets/garden/grass-mint.png", connectedAsset: "/assets/garden/grass-mint-connected.png", cost: 65, color: "#8ebd83" },
] as const;

const gardenShop = [
  { id: "stone", name: "돌길", asset: "/assets/garden/stone.png", cost: 280, unlockAt: 0, category: "장식", size: "small" },
  { id: "pot", name: "파란 화분", asset: "/assets/garden/pot.png", cost: 420, unlockAt: 0, category: "장식", size: "small" },
  { id: "flower", name: "노란 들꽃", asset: "/assets/garden/flower.png", cost: 360, unlockAt: 0, category: "꽃", size: "small" },
  { id: "sunflower", name: "해바라기", asset: "/assets/garden/sunflower.png", cost: 480, unlockAt: 0, category: "꽃", size: "small" },
  { id: "hydrangea", name: "수국", asset: "/assets/garden/hydrangea.png", cost: 620, unlockAt: 0, category: "꽃", size: "small" },
  { id: "watering-can", name: "물뿌리개", asset: "/assets/garden/watering-can.png", cost: 390, unlockAt: 0, category: "도구", size: "small" },
  { id: "lamp", name: "정원등", asset: "/assets/garden/lamp.png", cost: 760, unlockAt: 4, category: "장식", size: "small" },
  { id: "fence", name: "나무 울타리", asset: "/assets/garden/fence.png", cost: 520, unlockAt: 4, category: "장식", size: "small" },
  { id: "mushroom", name: "버섯 무리", asset: "/assets/garden/mushroom.png", cost: 680, unlockAt: 5, category: "꽃", size: "small" },
  { id: "stump", name: "나무 그루터기", asset: "/assets/garden/stump.png", cost: 740, unlockAt: 6, category: "장식", size: "small" },
  { id: "rocks", name: "둥근 바위", asset: "/assets/garden/rocks.png", cost: 720, unlockAt: 6, category: "장식", size: "small" },
  { id: "bench", name: "작은 벤치", asset: "/assets/garden/bench.png", cost: 980, unlockAt: 8, category: "장식", size: "medium" },
  { id: "mailbox", name: "우체통", asset: "/assets/garden/mailbox.png", cost: 860, unlockAt: 8, category: "장식", size: "small" },
  { id: "birdhouse", name: "새집", asset: "/assets/garden/birdhouse.png", cost: 940, unlockAt: 9, category: "장식", size: "small" },
  { id: "birdbath", name: "새 물그릇", asset: "/assets/garden/birdbath.png", cost: 1100, unlockAt: 10, category: "장식", size: "small" },
  { id: "cat", name: "정원 고양이", asset: "/assets/garden/cat.png", cost: 1280, unlockAt: 10, category: "친구", size: "small" },
  { id: "beehive", name: "작은 벌통", asset: "/assets/garden/beehive.png", cost: 1380, unlockAt: 12, category: "장식", size: "small" },
  { id: "pond", name: "미니 연못", asset: "/assets/garden/pond.png", cost: 1480, unlockAt: 12, category: "장식", size: "large" },
  { id: "fountain", name: "돌 분수", asset: "/assets/garden/fountain.png", cost: 1650, unlockAt: 14, category: "장식", size: "medium" },
  { id: "picnic", name: "피크닉 매트", asset: "/assets/garden/picnic.png", cost: 1500, unlockAt: 14, category: "장식", size: "large" },
  { id: "wheelbarrow", name: "꽃 수레", asset: "/assets/garden/wheelbarrow.png", cost: 1720, unlockAt: 16, category: "도구", size: "medium" },
  { id: "arch", name: "덩굴 아치", asset: "/assets/garden/arch.png", cost: 1900, unlockAt: 18, category: "장식", size: "medium" },
  { id: "vegetable-bed", name: "채소 텃밭", asset: "/assets/garden/vegetable-bed.png", cost: 1150, unlockAt: 0, category: "텃밭", size: "large", requiresFullLawn: true },
  { id: "tomato-bed", name: "토마토 텃밭", asset: "/assets/garden/tomato-bed.png", cost: 1280, unlockAt: 0, category: "텃밭", size: "large", requiresFullLawn: true },
  { id: "herb-bed", name: "허브 텃밭", asset: "/assets/garden/herb-bed.png", cost: 1320, unlockAt: 0, category: "텃밭", size: "large", requiresFullLawn: true },
  { id: "scarecrow", name: "허수아비", asset: "/assets/garden/scarecrow.png", cost: 1480, unlockAt: 0, category: "텃밭", size: "medium", requiresFullLawn: true },
  { id: "greenhouse", name: "미니 온실", asset: "/assets/garden/greenhouse.png", cost: 2400, unlockAt: 0, category: "텃밭", size: "large", requiresFullLawn: true },
] as const;

const treeStages = ["씨앗", "새싹", "어린 나무", "큰 나무"];
const treeVarieties = [
  { id: "default", name: "기본 숲나무", description: "초록 잎과 테라코타 열매", cost: 0, assets: treeStages.map((_, index) => `/assets/terracotta-stage-${index}.png`) },
  { id: "cherry", name: "벚꽃나무", description: "자랄수록 분홍 꽃이 풍성해져요", cost: 3600, assets: treeStages.map((_, index) => `/assets/terracotta-cherry-${index}.png`) },
  { id: "sunny", name: "노란 꽃나무", description: "햇빛 같은 노란 꽃이 피어요", cost: 3200, assets: treeStages.map((_, index) => `/assets/terracotta-sunny-${index}.png`) },
  { id: "lavender", name: "라벤더 꽃나무", description: "차분한 보랏빛 꽃으로 자라요", cost: 3400, assets: treeStages.map((_, index) => `/assets/terracotta-lavender-${index}.png`) },
] as const;

type Message = { role: "user" | "assistant"; text: string; models?: string };
type GardenPosition = { x: number; y: number };
type GroundTile = { cell: number; grassId: string };
type GardenPlacement = GardenPosition & { instanceId: string; itemId: string };
type GardenDrag = {
  kind: "decoration" | "character";
  id: string;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
  moved: boolean;
};
type McpTool = { name?: string; description?: string };
type McpConnection = {
  id: string;
  name: string;
  server_url: string;
  category: string;
  status: string;
  auth_type: string;
  tool_count: number;
  tools: McpTool[];
  note: string;
  setup: "auto" | "app" | "public" | "restricted" | "custom";
  docs: string | null;
  has_credentials: boolean;
  last_checked_at: string | null;
  error: string | null;
};

const mcpTemplates = [
  { name: "Shopify Storefront", url: "https://your-shop.myshopify.com/api/mcp", note: "your-shop을 실제 스토어 주소로 변경" },
  { name: "Cloudflare AI Search", url: "https://your-instance.search.ai.cloudflare.com/mcp", note: "공개 AI Search 인스턴스 주소" },
  { name: "Azure API Center", url: "https://your-service.data.your-region.azure-apicenter.ms/mcp", note: "서비스·리전 주소로 변경" },
];

const mcpBrandAssets: Record<string, string> = {
  github: "/assets/mcp/github.svg",
  notion: "/assets/mcp/notion.svg",
  figma: "/assets/mcp/figma.svg",
  linear: "/assets/mcp/linear.svg",
  "google-drive": "/assets/mcp/google-drive.svg",
  atlassian: "/assets/mcp/atlassian.svg",
  slack: "/assets/mcp/slack.png",
  asana: "/assets/mcp/asana.svg",
  airtable: "/assets/mcp/airtable.svg",
  canva: "/assets/mcp/canva.png",
  box: "/assets/mcp/box.svg",
  stripe: "/assets/mcp/stripe.svg",
  paypal: "/assets/mcp/paypal.svg",
  hubspot: "/assets/mcp/hubspot.svg",
  intercom: "/assets/mcp/intercom.svg",
  supabase: "/assets/mcp/supabase.svg",
  vercel: "/assets/mcp/vercel.svg",
  sentry: "/assets/mcp/sentry.svg",
  grafana: "/assets/mcp/grafana.svg",
  cloudflare: "/assets/mcp/cloudflare.svg",
  gitlab: "/assets/mcp/gitlab.svg",
  postman: "/assets/mcp/postman.svg",
  "microsoft-learn": "/assets/mcp/microsoft-learn.png",
  "hugging-face": "/assets/mcp/hugging-face.svg",
  exa: "/assets/mcp/exa.png",
  context7: "/assets/mcp/context7.png",
};

function TerracottaMark({ size = "normal" }: { size?: "tiny" | "normal" | "large" }) {
  return (
    <span className={`terracotta-mark ${size}`} aria-hidden="true">
      <i className="mark-leaf mark-leaf-left" />
      <i className="mark-leaf mark-leaf-right" />
      <i className="mark-stem" />
      <i className="mark-pot" />
    </span>
  );
}

function McpBrandMark({ id, name }: { id: string; name: string }) {
  const brandId = id.startsWith("cloudflare-") ? "cloudflare" : id;
  const asset = mcpBrandAssets[brandId];
  return (
    <span className={`mcp-service-mark ${asset ? "has-brand-logo" : "is-fallback"}`} aria-hidden="true">
      {asset ? <img src={asset} alt="" draggable={false} /> : name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [sparks, setSparks] = useState(100000);
  const [growth, setGrowth] = useState(0);
  const [groundTiles, setGroundTiles] = useState<GroundTile[]>([]);
  const [decorations, setDecorations] = useState<GardenPlacement[]>([]);
  const [characterPosition, setCharacterPosition] = useState<GardenPosition>({ x: 50, y: 50 });
  const [treeVariety, setTreeVariety] = useState("default");
  const [ownedTrees, setOwnedTrees] = useState<string[]>(["default"]);
  const [gardenDrag, setGardenDrag] = useState<GardenDrag | null>(null);
  const [activeGardenItem, setActiveGardenItem] = useState("character");
  const [shopCategory, setShopCategory] = useState("전체");
  const [gardenOpen, setGardenOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [modelLabOpen, setModelLabOpen] = useState(false);
  const [modelInsights, setModelInsights] = useState<ModelIntelligencePayload | null>(null);
  const [modelInsightLoading, setModelInsightLoading] = useState(false);
  const [modelInsightFilter, setModelInsightFilter] = useState("전체");
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpConnections, setMcpConnections] = useState<McpConnection[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpBusy, setMcpBusy] = useState<string | null>(null);
  const [mcpNote, setMcpNote] = useState("공식 서버를 연결하면 테라코타가 필요한 도구를 발견해 사용할 수 있어요.");
  const [customMcp, setCustomMcp] = useState({ name: "", url: "" });
  const [mcpQuery, setMcpQuery] = useState("");
  const [mcpCategory, setMcpCategory] = useState("전체");
  const [mcpSetupId, setMcpSetupId] = useState<string | null>(null);
  const [mcpCredentials, setMcpCredentials] = useState({ clientId: "", clientSecret: "" });
  const [modelPreference, setModelPreference] = useState<ModelPreference>("latest");
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [gardenNote, setGardenNote] = useState("정원은 아직 비어 있어요. 스토어에서 첫 잔디를 심어보세요.");
  const gardenCanvasRef = useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- browser-persisted owner preferences hydrate once after mount */
  useEffect(() => {
    const savedPreference = window.localStorage.getItem("terracotta-model-preference");
    if (savedPreference === "latest" || savedPreference === "gpt" || savedPreference === "claude") {
      setModelPreference(savedPreference);
    }
    const saved = window.localStorage.getItem("terracotta-garden-v3");
    const previous = window.localStorage.getItem("terracotta-garden-v2");
    const legacy = window.localStorage.getItem("terracotta-garden") ?? window.localStorage.getItem("orbit-simple-garden");
    if (saved) {
      try {
        const data = JSON.parse(saved) as {
          groundTiles?: GroundTile[];
          decorations?: GardenPlacement[];
          characterPosition?: GardenPosition;
          treeVariety?: string;
          ownedTrees?: string[];
          sparks?: number;
          growth?: number;
        };
        if (Array.isArray(data.groundTiles)) setGroundTiles(data.groundTiles.filter((item) => item.cell >= 0 && item.cell < 20));
        if (Array.isArray(data.decorations)) setDecorations(data.decorations.filter((item) => Number.isFinite(item.x) && Number.isFinite(item.y)));
        if (data.characterPosition && Number.isFinite(data.characterPosition.x) && Number.isFinite(data.characterPosition.y)) setCharacterPosition(data.characterPosition);
        if (typeof data.treeVariety === "string" && treeVarieties.some((item) => item.id === data.treeVariety)) setTreeVariety(data.treeVariety);
        if (Array.isArray(data.ownedTrees)) setOwnedTrees(Array.from(new Set(["default", ...data.ownedTrees])));
        if (typeof data.sparks === "number") setSparks(data.sparks);
        if (typeof data.growth === "number") setGrowth(data.growth);
      } catch { /* 새 정원으로 시작합니다. */ }
    } else if (previous) {
      try {
        type PreviousPlacement = { instanceId: string; itemId: string; cell: number };
        const data = JSON.parse(previous) as { placements?: PreviousPlacement[]; sparks?: number; growth?: number };
        const oldPlacements = Array.isArray(data.placements) ? data.placements : [];
        setGroundTiles(oldPlacements.filter((item) => item.itemId === "grass").map((item) => ({ cell: item.cell, grassId: "grass-sage" })));
        setDecorations(oldPlacements.filter((item) => item.itemId !== "grass").map((item) => ({
          instanceId: item.instanceId,
          itemId: item.itemId,
          x: 10 + (item.cell % 5) * 20,
          y: 14 + Math.floor(item.cell / 5) * 24,
        })));
        if (typeof data.sparks === "number") setSparks(Math.max(100000, data.sparks + 100000));
        if (typeof data.growth === "number") setGrowth(data.growth);
        setGardenNote("샘플 Sparks 100,000개를 넣어드렸어요. 자유롭게 드래그해 보세요.");
      } catch { /* 새 정원으로 시작합니다. */ }
    } else if (legacy) {
      try {
        const data = JSON.parse(legacy) as { sparks?: number; growth?: number };
        if (typeof data.sparks === "number") setSparks(Math.max(100000, data.sparks + 100000));
        if (typeof data.growth === "number") setGrowth(data.growth);
      } catch { /* 사용량만 새 정원으로 옮깁니다. */ }
    } else {
      setGardenNote("테스트용 Sparks 100,000개를 준비했어요. 잔디부터 한 칸씩 심어보세요.");
    }
    const params = new URLSearchParams(window.location.search);
    const mcpResult = params.get("mcp");
    if (mcpResult) {
      setMcpOpen(true);
      setMcpNote(mcpResult === "connected" ? "연결을 마쳤어요. 사용할 수 있는 도구를 동기화했습니다." : params.get("message") || "MCP 인증을 완료하지 못했어요.");
      void loadMcp();
      params.delete("mcp");
      params.delete("message");
      const nextQuery = params.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`);
    }
    setReady(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem("terracotta-garden-v3", JSON.stringify({
      groundTiles,
      decorations,
      characterPosition,
      treeVariety,
      ownedTrees,
      sparks,
      growth,
    }));
  }, [characterPosition, decorations, groundTiles, growth, ownedTrees, ready, sparks, treeVariety]);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem("terracotta-model-preference", modelPreference);
    void fetch("/api/model-registry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ preference: modelPreference }) }).catch(() => undefined);
  }, [modelPreference, ready]);

  useEffect(() => {
    if (!ready) return;
    void loadRegistry();
  }, [ready]);

  async function loadRegistry(refresh = false) {
    setRegistryLoading(true);
    try {
      const response = await fetch(`/api/model-registry${refresh ? "?refresh=1" : ""}`, { cache: "no-store" });
      if (!response.ok) throw new Error("registry unavailable");
      setRegistryStatus(await response.json() as RegistryStatus);
    } catch { setRegistryStatus(null); }
    finally { setRegistryLoading(false); }
  }

  async function loadModelInsights() {
    setModelInsightLoading(true);
    try {
      const response = await fetch("/api/model-intelligence", { cache: "no-store" });
      if (!response.ok) throw new Error("model intelligence unavailable");
      setModelInsights(await response.json() as ModelIntelligencePayload);
    } catch { setModelInsights(null); }
    finally { setModelInsightLoading(false); }
  }

  function openModelLab() {
    setModelLabOpen(true);
    setSettingsOpen(false);
    setMobileMenu(false);
    if (!modelInsights) void loadModelInsights();
  }

  async function loadMcp() {
    setMcpLoading(true);
    try {
      const response = await fetch("/api/mcp", { cache: "no-store" });
      const payload = await response.json() as { connections?: McpConnection[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "MCP 연결을 불러오지 못했어요.");
      setMcpConnections(payload.connections ?? []);
    } catch (error) {
      setMcpNote(error instanceof Error ? error.message : "MCP 연결을 불러오지 못했어요.");
    } finally {
      setMcpLoading(false);
    }
  }

  function openMcpHub() {
    setMcpOpen(true);
    setMobileMenu(false);
    void loadMcp();
  }

  async function connectMcp(id: string) {
    setMcpBusy(id);
    setMcpNote("서버의 인증 방식과 도구를 확인하고 있어요.");
    try {
      const response = await fetch("/api/mcp/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json() as { connected?: boolean; authUrl?: string; toolCount?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "MCP 연결을 시작하지 못했어요.");
      if (payload.authUrl) {
        window.location.assign(payload.authUrl);
        return;
      }
      setMcpNote(`${payload.toolCount ?? 0}개 도구를 연결했어요.`);
      await loadMcp();
    } catch (error) {
      setMcpNote(error instanceof Error ? error.message : "MCP 연결을 시작하지 못했어요.");
      await loadMcp();
    } finally {
      setMcpBusy(null);
    }
  }

  async function addCustomMcp(event: FormEvent) {
    event.preventDefault();
    if (!customMcp.url.trim()) return;
    setMcpBusy("custom");
    try {
      const response = await fetch("/api/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(customMcp) });
      const payload = await response.json() as { id?: string; error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error || "서버를 추가하지 못했어요.");
      setCustomMcp({ name: "", url: "" });
      setMcpNote("사용자 MCP 서버를 추가했어요. 연결을 눌러 인증해 주세요.");
      await loadMcp();
    } catch (error) {
      setMcpNote(error instanceof Error ? error.message : "서버를 추가하지 못했어요.");
    } finally {
      setMcpBusy(null);
    }
  }

  async function disconnectMcp(id: string) {
    setMcpBusy(id);
    try {
      const response = await fetch(`/api/mcp?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "연결을 해제하지 못했어요.");
      setMcpNote("저장된 인증과 도구 목록을 지웠어요.");
      await loadMcp();
    } catch (error) {
      setMcpNote(error instanceof Error ? error.message : "연결을 해제하지 못했어요.");
    } finally {
      setMcpBusy(null);
    }
  }

  async function saveMcpCredentials(event: FormEvent) {
    event.preventDefault();
    if (!mcpSetupId || !mcpCredentials.clientId.trim()) return;
    setMcpBusy(mcpSetupId);
    try {
      const response = await fetch("/api/mcp", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: mcpSetupId, ...mcpCredentials }) });
      const payload = await response.json() as { configured?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "OAuth 앱 키를 저장하지 못했어요.");
      setMcpCredentials({ clientId: "", clientSecret: "" });
      setMcpSetupId(null);
      setMcpNote("OAuth 앱 키를 암호화해 저장했어요. 이제 연결을 눌러 승인해 주세요.");
      await loadMcp();
    } catch (error) {
      setMcpNote(error instanceof Error ? error.message : "OAuth 앱 키를 저장하지 못했어요.");
    } finally {
      setMcpBusy(null);
    }
  }

  const routingOrder = useMemo(() => {
    if (modelPreference === "claude") return { primary: registryStatus?.models.find((model) => model.provider === "anthropic")?.name ?? "Claude Fable 5", backup: "GPT-5.6" };
    if (modelPreference === "latest" && registryStatus?.latestPrimary?.provider === "anthropic") return { primary: registryStatus.latestPrimary.model, backup: registryStatus.models.find((model) => model.provider === "openai")?.name ?? "GPT" };
    if (modelPreference === "latest" && registryStatus?.latestPrimary?.provider === "openai") return { primary: registryStatus.latestPrimary.model, backup: registryStatus.models.find((model) => model.provider === "anthropic")?.name ?? "Claude" };
    return { primary: "GPT-5.6", backup: "Claude Sonnet 5" };
  }, [modelPreference, registryStatus]);

  const preferenceLabel = modelPreference === "latest" ? "최신 우선" : modelPreference === "gpt" ? "GPT 우선" : "Claude 우선";

  const selectedTeam = useMemo(() => {
    const text = prompt.toLowerCase();
    if (text.includes("영상") || text.includes("릴스") || text.includes("이미지")) return `Higgsfield + ${routingOrder.primary}`;
    if (text.includes("찾") || text.includes("최신") || text.includes("리서치") || text.includes("검색")) return `Perplexity + ${routingOrder.primary}`;
    return `${routingOrder.primary} 우선 · ${routingOrder.backup} 검토`;
  }, [prompt, routingOrder]);

  const usageLevel = 12 + growth;
  const treeStage = Math.min(3, Math.floor(usageLevel / 12));
  const nextTreeAt = treeStage === 3 ? null : (treeStage + 1) * 12;
  const selectedTree = treeVarieties.find((item) => item.id === treeVariety) ?? treeVarieties[0];
  const treeAssets = selectedTree.assets;
  const groundByCell = useMemo(() => new Map(groundTiles.map((item) => [item.cell, item.grassId])), [groundTiles]);
  const fullLawnGrassId = groundTiles.length === 20 && groundTiles.every((tile) => tile.grassId === groundTiles[0]?.grassId) ? groundTiles[0].grassId : null;
  const fullLawn = grassShop.find((item) => item.id === fullLawnGrassId) ?? null;
  const gardenCategories = useMemo(() => ["전체", ...Array.from(new Set(gardenShop.map((item) => item.category)))], []);
  const visibleGardenItems = useMemo(() => gardenShop.filter((item) => shopCategory === "전체" || item.category === shopCategory), [shopCategory]);
  const visibleModelInsights = useMemo(() => (modelInsights?.models ?? []).filter((model) => modelInsightFilter === "전체" || model.categories.includes(modelInsightFilter)), [modelInsightFilter, modelInsights]);
  const mcpCategories = useMemo(() => ["전체", ...Array.from(new Set(mcpConnections.map((item) => item.category)))], [mcpConnections]);
  const visibleMcpConnections = useMemo(() => {
    const query = mcpQuery.trim().toLowerCase();
    return mcpConnections.filter((item) => (mcpCategory === "전체" || item.category === mcpCategory) && (!query || `${item.name} ${item.note} ${item.category}`.toLowerCase().includes(query)));
  }, [mcpCategory, mcpConnections, mcpQuery]);
  const setupConnection = mcpConnections.find((item) => item.id === mcpSetupId) ?? null;

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    const task = prompt.trim();
    if (!task || isWorking) return;
    const team = selectedTeam;
    setMessages((items) => [...items, { role: "user", text: task }]);
    setPrompt("");
    setIsWorking(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: task, preference: modelPreference }) });
      const payload = await response.json() as { text?: string; model?: string; provider?: string; costUsd?: number; error?: string; code?: string };
      if (!response.ok) {
        const guidance = payload.code === "HIGGSFIELD_MCP_AUTH_REQUIRED" ? "Higgsfield 계정을 MCP로 인증하면 이미지와 영상 생성이 바로 연결돼요." : payload.code === "PROVIDER_KEY_REQUIRED" ? "모델 라우터는 준비됐어요. 설정 화면에 표시된 공급사 API 키를 서버에 연결하면 실제 답변을 시작합니다." : payload.error ?? "연결된 모델이 잠시 응답하지 않았어요.";
        setMessages((items) => [...items, { role: "assistant", text: guidance, models: "연결 설정 필요" }]);
        return;
      }
      setMessages((items) => [...items, {
        role: "assistant",
        text: payload.text ?? "답변을 준비했어요.",
        models: `${payload.model ?? team} · 실제 API${typeof payload.costUsd === "number" ? ` · $${payload.costUsd.toFixed(4)}` : ""}`,
      }]);
      setSparks((value) => value + 36);
      setGrowth((value) => value + 1);
      setGardenNote("방금 끝낸 작업이 새 지식으로 쌓였어요. 받은 Sparks로 정원을 꾸며보세요.");
      void loadRegistry();
    } catch {
      setMessages((items) => [...items, { role: "assistant", text: "실제 모델 백엔드에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.", models: "연결 오류" }]);
    } finally {
      setIsWorking(false);
    }
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function plantGrass(item: (typeof grassShop)[number]) {
    if (groundTiles.length >= 20) {
      setGardenNote(fullLawn ? `${fullLawn.name} 한 판이 완성됐어요. 이제 텃밭 아이템을 놓을 수 있어요.` : "지면 20칸이 찼어요. 같은 색으로 연결하려면 잔디를 걷어내고 한 종류로 다시 심어보세요.");
      return;
    }
    if (sparks < item.cost) {
      setGardenNote(`${item.name}을 심으려면 ${item.cost - sparks} Sparks가 더 필요해요.`);
      return;
    }
    const plantingOrder = [12, 7, 11, 13, 17, 6, 8, 16, 18, 2, 10, 14, 22, 1, 3, 5, 9, 15, 19, 0, 4];
    const nextCell = plantingOrder.find((cell) => cell < 20 && !groundByCell.has(cell));
    if (nextCell === undefined) return;
    const nextTiles = [...groundTiles, { cell: nextCell, grassId: item.id }];
    setGroundTiles(nextTiles);
    setSparks((value) => value - item.cost);
    const completed = nextTiles.length === 20 && nextTiles.every((tile) => tile.grassId === item.id);
    setGardenNote(completed ? `${item.name} 20칸이 이어져 한 판이 됐어요. 텃밭 상점이 열렸습니다.` : `${item.name}을 한 칸 심었어요. 같은 잔디 ${nextTiles.filter((tile) => tile.grassId === item.id).length}/20`);
  }

  function buyItem(item: (typeof gardenShop)[number]) {
    if (usageLevel < item.unlockAt) {
      setGardenNote(`${item.name}은 사용량 ${item.unlockAt}부터 잠금 해제돼요.`);
      return;
    }
    if ("requiresFullLawn" in item && item.requiresFullLawn && !fullLawn) {
      setGardenNote(`${item.name}은 같은 색 잔디 20칸을 이어 한 판으로 만들면 살 수 있어요.`);
      return;
    }
    if (sparks < item.cost) {
      setGardenNote(`${item.name}을 놓으려면 ${item.cost - sparks} Sparks가 더 필요해요.`);
      return;
    }
    const instanceId = `${item.id}-${Date.now()}-${decorations.length}`;
    const dropSlots = [
      { x: 24, y: 70 }, { x: 76, y: 68 }, { x: 20, y: 35 }, { x: 80, y: 34 },
      { x: 35, y: 80 }, { x: 65, y: 82 }, { x: 12, y: 55 }, { x: 88, y: 55 },
    ];
    const position = dropSlots[decorations.length % dropSlots.length];
    setDecorations((items) => [...items, { instanceId, itemId: item.id, ...position }]);
    setSparks((value) => value - item.cost);
    setActiveGardenItem(instanceId);
    setGardenNote(`${item.name}을 놓았어요. 타일 경계 없이 원하는 위치로 끌어보세요.`);
  }

  function clearLawn() {
    setGroundTiles([]);
    setGardenNote("잔디를 걷어냈어요. 원하는 색을 골라 다시 한 칸씩 심을 수 있어요.");
  }

  function chooseTree(item: (typeof treeVarieties)[number]) {
    if (!ownedTrees.includes(item.id)) {
      if (sparks < item.cost) {
        setGardenNote(`${item.name}을 키우려면 ${item.cost - sparks} Sparks가 더 필요해요.`);
        return;
      }
      setOwnedTrees((items) => [...items, item.id]);
      setSparks((value) => value - item.cost);
    }
    setTreeVariety(item.id);
    setActiveGardenItem("character");
    setGardenNote(`${item.name}으로 성장 방향을 바꿨어요. 현재 사용량 단계는 그대로 이어집니다.`);
  }

  function startGardenDrag(event: ReactPointerEvent<HTMLButtonElement>, kind: GardenDrag["kind"], id: string, position: GardenPosition) {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setActiveGardenItem(id);
    setGardenDrag({
      kind,
      id,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startX: position.x,
      startY: position.y,
      moved: false,
    });
  }

  function handleGardenPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gardenDrag || gardenDrag.pointerId !== event.pointerId || !gardenCanvasRef.current) return;
    const bounds = gardenCanvasRef.current.getBoundingClientRect();
    const x = Math.min(95, Math.max(5, gardenDrag.startX + ((event.clientX - gardenDrag.startClientX) / bounds.width) * 100));
    const y = Math.min(92, Math.max(8, gardenDrag.startY + ((event.clientY - gardenDrag.startClientY) / bounds.height) * 100));
    if (gardenDrag.kind === "character") setCharacterPosition({ x, y });
    else setDecorations((items) => items.map((item) => item.instanceId === gardenDrag.id ? { ...item, x, y } : item));
    if (!gardenDrag.moved && Math.hypot(event.clientX - gardenDrag.startClientX, event.clientY - gardenDrag.startClientY) > 3) {
      setGardenDrag((current) => current ? { ...current, moved: true } : null);
    }
  }

  function finishGardenDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (!gardenDrag || gardenDrag.pointerId !== event.pointerId) return;
    if (gardenDrag.moved) setGardenNote(gardenDrag.kind === "character" ? "테라 캐릭터 위치를 저장했어요." : "장식 위치를 자유 좌표로 저장했어요.");
    setGardenDrag(null);
  }

  function moveGardenItemWithKeyboard(event: KeyboardEvent<HTMLButtonElement>, kind: GardenDrag["kind"], id: string) {
    const delta = event.shiftKey ? 5 : 2;
    const offset = event.key === "ArrowLeft" ? { x: -delta, y: 0 } : event.key === "ArrowRight" ? { x: delta, y: 0 } : event.key === "ArrowUp" ? { x: 0, y: -delta } : event.key === "ArrowDown" ? { x: 0, y: delta } : null;
    if (!offset) return;
    event.preventDefault();
    const move = (position: GardenPosition) => ({ x: Math.min(95, Math.max(5, position.x + offset.x)), y: Math.min(92, Math.max(8, position.y + offset.y)) });
    if (kind === "character") setCharacterPosition((position) => move(position));
    else setDecorations((items) => items.map((item) => item.instanceId === id ? { ...item, ...move(item) } : item));
    setActiveGardenItem(id);
  }

  function gardenPositionStyle(position: GardenPosition) {
    return { left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(20 + position.y) };
  }

  function newChat() {
    setMessages([]);
    setPrompt("");
    setMobileMenu(false);
  }

  return (
    <main className="app-frame">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-top">
          <button className="wordmark" onClick={newChat} aria-label="테라코타 홈">
            <TerracottaMark /> Terracotta
          </button>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="메뉴 닫기">×</button>
        </div>

        <button className="new-chat" onClick={newChat}><span>＋</span> 새 대화</button>

        <nav className="sidebar-nav" aria-label="주요 메뉴">
          <button className="active" onClick={() => setMobileMenu(false)}><span>○</span> 대화</button>
          <button onClick={() => { setGardenOpen(true); setMobileMenu(false); }}><span>♧</span> 테라코타 가든</button>
          <button onClick={openMcpHub}><span>⌁</span> MCP 연결</button>
          <button onClick={openModelLab}><span>◫</span> 모델 연구소</button>
          <button onClick={() => { setSettingsOpen(true); setMobileMenu(false); }}><span>⌘</span> 모델 및 구독</button>
        </nav>

        <div className="recents">
          <p>최근 대화</p>
          <button>이번 주 업무 정리</button>
          <button>신제품 아이디어</button>
          <button>영상 콘티 초안</button>
        </div>

        <div className="sidebar-account">
          <span>LK</span>
          <div><b>내 테라코타</b><small>{sparks.toLocaleString()} Sparks</small></div>
          <button aria-label="계정 메뉴">•••</button>
        </div>
      </aside>

      {mobileMenu && <button className="sidebar-scrim" onClick={() => setMobileMenu(false)} aria-label="메뉴 닫기" />}

      <section className="chat-panel">
        <header className="chat-header">
          <button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="메뉴 열기">☰</button>
          <button className="model-switch" onClick={() => setSettingsOpen(true)}>
            Terracotta Auto · {preferenceLabel} <span>⌄</span>
          </button>
          <span className="private-state"><i /> 개인 메모리 켜짐</span>
        </header>

        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <span className="hello-seed"><TerracottaMark size="large" /></span>
              <h1>무엇을 도와드릴까요?</h1>
              <p>필요한 모델은 제가 알아서 고를게요.</p>
              <div className="quick-prompts">
                {quickPrompts.map((item) => (
                  <button key={item} onClick={() => setPrompt(item)}>{item}<span>↗</span></button>
                ))}
              </div>
            </div>
          ) : (
            <div className="message-list">
              {messages.map((message, index) => (
                <article className={`message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.role === "assistant" && <span className="assistant-seed"><TerracottaMark size="tiny" /></span>}
                  <div>
                    <p>{message.text}</p>
                    {message.models && <small>{message.models}로 함께 작업함 · 가든 +1</small>}
                  </div>
                </article>
              ))}
              {isWorking && (
                <article className="message assistant thinking">
                  <span className="assistant-seed"><TerracottaMark size="tiny" /></span>
                  <div><p><i /><i /><i /></p><small>{selectedTeam}가 작업 중</small></div>
                </article>
              )}
            </div>
          )}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={submitTask}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleComposerKey}
              placeholder="테라코타에게 무엇이든 물어보세요"
              aria-label="테라코타에게 보낼 메시지"
              rows={1}
            />
            <div className="composer-actions">
              <div>
                <button type="button" aria-label="파일 첨부">＋</button>
                <button type="button" aria-label="웹 검색">◎</button>
              </div>
              <span>{selectedTeam}</span>
              <button className="send-button" disabled={!prompt.trim() || isWorking} aria-label="메시지 보내기">↑</button>
            </div>
          </form>
          <p>테라코타는 실수할 수 있어요. 중요한 정보는 확인해 주세요.</p>
        </div>
      </section>

      <aside className="garden-rail" aria-label="테라코타 가든">
        <div className="garden-rail-head">
          <div><b>테라코타 가든</b><span><i /> {selectedTree.name} · {treeStages[treeStage]}</span></div>
          <button onClick={() => setGardenOpen(true)} aria-label="가든 크게 보기">↗</button>
        </div>
        <button className="pixel-garden" onClick={() => setGardenOpen(true)} aria-label="가든 열기">
          <div className={`garden-ground-grid mini ${fullLawn ? "connected" : ""}`}>
            {Array.from({ length: 20 }, (_, index) => {
              const grass = grassShop.find((item) => item.id === groundByCell.get(index));
              return <i key={index} className={grass ? "has-grass" : ""} style={grass ? { backgroundImage: `url(${fullLawn ? grass.connectedAsset : grass.asset})` } : undefined} />;
            })}
          </div>
          {decorations.map((placement) => {
              const item = gardenShop.find((entry) => entry.id === placement.itemId);
              return item ? <img key={placement.instanceId} className={`mini-free-item size-${item.size}`} style={gardenPositionStyle(placement)} src={item.asset} alt="" draggable={false} /> : null;
          })}
          <img className="mini-character" style={gardenPositionStyle(characterPosition)} src={treeAssets[treeStage]} alt={`${selectedTree.name} ${treeStages[treeStage]} 단계`} draggable={false} />
        </button>
        <div className="garden-rail-foot">
          <span>{fullLawn ? "잔디 한 판 완성" : `잔디 ${groundTiles.length}/20`}</span>
          <button onClick={() => setGardenOpen(true)}>가꾸기</button>
        </div>
      </aside>

      {gardenOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setGardenOpen(false)}>
          <section className="dialog garden-dialog" role="dialog" aria-modal="true" aria-label="테라코타 가든" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setGardenOpen(false)} aria-label="닫기">×</button>
            <header><p>Terracotta Garden</p><h2>내 지식 정원</h2><span>{gardenNote}</span></header>
            <p className="drag-help">잔디는 지면에 한 칸씩 심고, 장식과 테라 캐릭터는 타일과 상관없이 어디든 자유롭게 끌 수 있어요. 방향키로도 미세 조정됩니다.</p>
            <div
              ref={gardenCanvasRef}
              className={`large-garden ${gardenDrag ? "dragging" : ""}`}
              onPointerMove={handleGardenPointerMove}
              onPointerUp={finishGardenDrag}
              onPointerCancel={finishGardenDrag}
            >
              <div className={`garden-ground-grid large ${fullLawn ? "connected" : ""}`} aria-label="5×4 잔디 지면">
                {Array.from({ length: 20 }, (_, index) => {
                  const grass = grassShop.find((item) => item.id === groundByCell.get(index));
                  return <i key={index} className={grass ? "has-grass" : ""} style={grass ? { backgroundImage: `url(${fullLawn ? grass.connectedAsset : grass.asset})` } : undefined} aria-label={`${index + 1}번째 ${grass?.name ?? "흙"}`} />;
                })}
              </div>
              {decorations.map((placement) => {
                const item = gardenShop.find((entry) => entry.id === placement.itemId);
                if (!item) return null;
                return (
                  <button
                    type="button"
                    key={placement.instanceId}
                    className={`free-garden-item size-${item.size} ${activeGardenItem === placement.instanceId ? "selected" : ""}`}
                    style={gardenPositionStyle(placement)}
                    onPointerDown={(event) => startGardenDrag(event, "decoration", placement.instanceId, placement)}
                    onKeyDown={(event) => moveGardenItemWithKeyboard(event, "decoration", placement.instanceId)}
                    aria-label={`${item.name} 자유롭게 옮기기`}
                  >
                    <img src={item.asset} alt="" draggable={false} />
                  </button>
                );
              })}
              <button
                type="button"
                className={`garden-character ${activeGardenItem === "character" ? "selected" : ""}`}
                style={gardenPositionStyle(characterPosition)}
                onPointerDown={(event) => startGardenDrag(event, "character", "character", characterPosition)}
                onKeyDown={(event) => moveGardenItemWithKeyboard(event, "character", "character")}
                aria-label={`${selectedTree.name} 테라 캐릭터 자유롭게 옮기기`}
              >
                <img src={treeAssets[treeStage]} alt={`${selectedTree.name} ${treeStages[treeStage]} 단계`} draggable={false} />
              </button>
              <span className="free-drag-badge">자유 배치 · 1% 단위 저장</span>
            </div>
            <div className="garden-meta"><span><b>{treeStages[treeStage]}</b>{nextTreeAt ? `다음 성장까지 ${nextTreeAt - usageLevel}` : "모두 자랐어요"}</span><span><b>{usageLevel}</b> 누적 사용량</span><span><b>{sparks.toLocaleString()}</b> Sparks</span></div>
            <div className="sample-credit"><span>TEST</span><b>샘플 Sparks가 넉넉히 들어있어요.</b><small>아이템과 나무를 마음껏 구매해 드래그를 확인해 보세요.</small></div>

            <div className="shop-heading lawn-heading">
              <div><h3>잔디 심기</h3><p>같은 색 20칸을 채우면 경계가 사라지고 하나의 잔디밭으로 이어져요.</p></div>
              <button type="button" onClick={clearLawn} disabled={groundTiles.length === 0}>잔디 걷어내기</button>
            </div>
            <div className="lawn-shop">
              {grassShop.map((item) => {
                const count = groundTiles.filter((tile) => tile.grassId === item.id).length;
                return (
                  <button type="button" key={item.id} onClick={() => plantGrass(item)} disabled={groundTiles.length >= 20 || sparks < item.cost}>
                    <span className="lawn-swatch" style={{ backgroundImage: `url(${item.asset})`, borderColor: item.color }} />
                    <b>{item.name}</b><small>{count}/20 · 한 칸 {item.cost} S</small>
                  </button>
                );
              })}
              <span className={`lawn-progress ${fullLawn ? "complete" : ""}`}><b>{groundTiles.length}/20</b>{fullLawn ? `${fullLawn.name} 한 판 완성` : "같은 색으로 채우면 텃밭 해금"}</span>
            </div>

            <div className="shop-heading">
              <div><h3>가드닝 스토어</h3><p>모든 장식은 여러 개 살 수 있고 잔디 위에서 자유롭게 겹쳐 놓을 수 있어요.</p></div>
              <span>{gardenShop.filter((item) => usageLevel >= item.unlockAt).length}/{gardenShop.length} 아이템 해금</span>
            </div>
            <div className="garden-shop-tabs" role="tablist" aria-label="가드닝 아이템 카테고리">
              {gardenCategories.map((category) => <button type="button" role="tab" aria-selected={shopCategory === category} className={shopCategory === category ? "active" : ""} key={category} onClick={() => setShopCategory(category)}>{category}</button>)}
            </div>
            <div className="simple-shop">
              {visibleGardenItems.map((item) => {
                const locked = usageLevel < item.unlockAt;
                const lawnLocked = "requiresFullLawn" in item && item.requiresFullLawn && !fullLawn;
                const count = decorations.filter((placement) => placement.itemId === item.id).length;
                return (
                  <button key={item.id} className={locked || lawnLocked ? "locked" : ""} disabled={locked || lawnLocked || sparks < item.cost} onClick={() => buyItem(item)}>
                    <span className="shop-item-preview"><img src={item.asset} alt="" draggable={false} /></span><b>{item.name}</b><small>{locked ? `사용량 ${item.unlockAt}에 해금` : lawnLocked ? "잔디 한 판 완성 후 해금" : `${item.cost} S${count ? ` · 보유 ${count}` : ""}`}</small>
                  </button>
                );
              })}
            </div>

            <div className="shop-heading tree-heading">
              <div><h3>성장 나무 선택</h3><p>품종을 사도 사용량으로 자라는 단계는 유지돼요. 네 단계를 미리 볼 수 있습니다.</p></div>
              <span>{ownedTrees.length}/{treeVarieties.length} 품종 보유</span>
            </div>
            <div className="tree-shop">
              {treeVarieties.map((item) => {
                const owned = ownedTrees.includes(item.id);
                const selected = treeVariety === item.id;
                return (
                  <article key={item.id} className={selected ? "selected" : ""}>
                    <div className="tree-card-title"><div><b>{item.name}</b><small>{item.description}</small></div><span>{selected ? "사용 중" : owned ? "보유" : `${item.cost.toLocaleString()} S`}</span></div>
                    <div className="tree-stage-preview">
                      {item.assets.map((asset, index) => <span key={asset} className={treeStage === index ? "current" : ""}><img src={asset} alt={`${item.name} ${treeStages[index]}`} draggable={false} /><small>{treeStages[index]}</small></span>)}
                    </div>
                    <button type="button" disabled={selected || (!owned && sparks < item.cost)} onClick={() => chooseTree(item)}>{selected ? "현재 나무" : owned ? "이 나무로 변경" : "구매하고 변경"}</button>
                  </article>
                );
              })}
            </div>
            <p className="device-note">정원은 현재 기기에 저장됩니다.</p>
          </section>
        </div>
      )}

      {mcpOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setMcpOpen(false)}>
          <section className="dialog mcp-dialog" role="dialog" aria-modal="true" aria-label="MCP 연결" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setMcpOpen(false)} aria-label="닫기">×</button>
            <header className="mcp-header">
              <TerracottaMark size="large" />
              <div><p>Terracotta MCP Hub</p><h2>일하는 곳을 연결하세요</h2><span>승인한 서비스의 도구만 테라코타가 발견하고 사용합니다.</span></div>
            </header>

            <div className="mcp-summary">
              <span><i className="online" /><b>{mcpConnections.filter((item) => item.status === "connected").length}</b> 연결됨</span>
              <span><b>{mcpConnections.reduce((sum, item) => sum + item.tool_count, 0)}</b> 사용 가능한 도구</span>
              <span><b>{mcpConnections.filter((item) => !item.id.startsWith("custom-")).length}</b> 공식 커넥터</span>
              <button onClick={() => void loadMcp()} disabled={mcpLoading}>{mcpLoading ? "확인 중" : "새로고침"}</button>
            </div>

            <p className="mcp-note">{mcpNote}</p>

            <div className="mcp-browser">
              <input value={mcpQuery} onChange={(event) => setMcpQuery(event.target.value)} placeholder="GitHub, 디자인, 결제처럼 검색" aria-label="MCP 검색" />
              <div className="mcp-categories">{mcpCategories.map((category) => <button key={category} className={mcpCategory === category ? "active" : ""} onClick={() => setMcpCategory(category)}>{category}</button>)}</div>
            </div>

            <div className="mcp-grid" aria-live="polite">
              {mcpLoading && mcpConnections.length === 0 ? <p className="mcp-empty">연결 목록을 불러오고 있어요.</p> : visibleMcpConnections.length === 0 ? <p className="mcp-empty">조건에 맞는 MCP가 없어요.</p> : visibleMcpConnections.map((item) => {
                const connected = item.status === "connected";
                const authorizing = item.status === "authorizing";
                const failed = item.status === "error";
                const needsApp = item.setup === "app" && !item.has_credentials;
                return (
                  <article className={`mcp-card ${connected ? "connected" : ""}`} key={item.id}>
                    <div className="mcp-card-top">
                      <McpBrandMark id={item.id} name={item.name} />
                      <div><b>{item.name}</b><small>{item.category} · {item.note}</small></div>
                      <em className={connected ? "connected" : failed ? "failed" : ""}>{connected ? `${item.tool_count}개 도구` : authorizing ? "승인 중" : failed ? "확인 필요" : needsApp ? "앱 키 필요" : item.setup === "public" ? "바로 연결" : item.setup === "restricted" ? "공급사 승인형" : "연결 안 됨"}</em>
                    </div>
                    {connected && item.tools.length > 0 && (
                      <div className="mcp-tools">{item.tools.slice(0, 4).map((tool, index) => <span key={`${tool.name ?? "tool"}-${index}`}>{tool.name ?? "tool"}</span>)}{item.tools.length > 4 && <span>+{item.tools.length - 4}</span>}</div>
                    )}
                    {item.error && !connected && <p className="mcp-error">{item.error}</p>}
                    <div className="mcp-card-actions">
                      <button className="mcp-connect" disabled={mcpBusy === item.id || needsApp} onClick={() => void connectMcp(item.id)}>{mcpBusy === item.id ? "확인 중" : connected ? "다시 연결" : needsApp ? "앱 키 먼저" : "연결"}</button>
                      {item.setup === "app" && <button className="mcp-setup" onClick={() => { setMcpSetupId(item.id); setMcpCredentials({ clientId: "", clientSecret: "" }); }}>{item.has_credentials ? "앱 키 변경" : "앱 키 설정"}</button>}
                      {item.docs && <a href={item.docs} target="_blank" rel="noreferrer">공식 안내</a>}
                      {(connected || item.id.startsWith("custom-")) && <button className="mcp-disconnect" disabled={mcpBusy === item.id} onClick={() => void disconnectMcp(item.id)}>{item.id.startsWith("custom-") ? "삭제" : "연결 해제"}</button>}
                    </div>
                  </article>
                );
              })}
            </div>

            {setupConnection && (
              <form className="mcp-oauth-setup" onSubmit={saveMcpCredentials}>
                <div className="mcp-oauth-title"><div><b>{setupConnection.name} OAuth 앱</b><small>공급사 개발자 화면에서 아래 콜백 주소로 앱을 만든 뒤 받은 키를 입력하세요.</small></div><button type="button" onClick={() => setMcpSetupId(null)} aria-label="앱 키 설정 닫기">×</button></div>
                <label><span>콜백 주소</span><input readOnly value={ready && typeof window !== "undefined" ? `${window.location.origin}/api/mcp/callback` : "/api/mcp/callback"} /></label>
                <label><span>Client ID</span><input value={mcpCredentials.clientId} onChange={(event) => setMcpCredentials((value) => ({ ...value, clientId: event.target.value }))} required autoComplete="off" /></label>
                <label><span>Client Secret</span><input type="password" value={mcpCredentials.clientSecret} onChange={(event) => setMcpCredentials((value) => ({ ...value, clientSecret: event.target.value }))} autoComplete="new-password" placeholder="공개 클라이언트면 비워둘 수 있어요" /></label>
                <button className="mcp-oauth-save" disabled={mcpBusy === setupConnection.id}>{mcpBusy === setupConnection.id ? "저장 중" : "암호화해 저장"}</button>
              </form>
            )}

            <div className="mcp-templates">
              <div><b>주소형 커넥터</b><small>내 서비스 주소가 따로 있는 MCP는 골라서 주소만 바꾸세요.</small></div>
              {mcpTemplates.map((template) => <button key={template.name} onClick={() => { setCustomMcp({ name: template.name, url: template.url }); setMcpNote(template.note); }}>{template.name}</button>)}
            </div>

            <form className="custom-mcp" onSubmit={addCustomMcp}>
              <div><b>직접 추가</b><small>Streamable HTTP를 지원하는 공개 HTTPS MCP 서버</small></div>
              <input value={customMcp.name} onChange={(event) => setCustomMcp((value) => ({ ...value, name: event.target.value }))} placeholder="서버 이름" aria-label="MCP 서버 이름" />
              <input value={customMcp.url} onChange={(event) => setCustomMcp((value) => ({ ...value, url: event.target.value }))} placeholder="https://example.com/mcp" type="url" required aria-label="MCP 서버 주소" />
              <button disabled={mcpBusy === "custom"}>{mcpBusy === "custom" ? "추가 중" : "추가"}</button>
            </form>

            <p className="mcp-security"><span>✓</span> OAuth 2.1 · PKCE S256 · 토큰 암호화 저장 · 내부 네트워크 주소 차단</p>
          </section>
        </div>
      )}

      {modelLabOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setModelLabOpen(false)}>
          <section className="dialog model-lab-dialog" role="dialog" aria-modal="true" aria-label="모델 연구소" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setModelLabOpen(false)} aria-label="닫기">×</button>
            <header className="model-lab-header">
              <div><p>Model intelligence</p><h2>최근 모델, 한눈에 비교</h2><span>순위 하나보다 실제 작업 적합도와 비용까지 같이 봅니다.</span></div>
              <button type="button" onClick={() => void loadModelInsights()} disabled={modelInsightLoading}>{modelInsightLoading ? "갱신 중" : "순위 새로고침"}</button>
            </header>

            <div className="model-lab-status">
              <span><i className={modelInsights?.liveArena ? "online" : ""} /> {modelInsights?.liveArena ? "Arena 공개 데이터 연결됨" : "검증된 최근 스냅샷"}</span>
              <b>기준일 {modelInsights?.updatedAt ?? "확인 중"}</b>
            </div>

            <div className="model-lab-filters" role="tablist" aria-label="모델 비교 필터">
              {modelInsightFilters.map((filter) => <button type="button" role="tab" aria-selected={modelInsightFilter === filter} className={modelInsightFilter === filter ? "active" : ""} key={filter} onClick={() => setModelInsightFilter(filter)}>{filter}</button>)}
            </div>

            {modelInsightLoading && !modelInsights && <div className="model-lab-loading"><TerracottaMark size="large" /><b>최신 순위를 모으고 있어요.</b><span>Text · Agent · WebDev · Vision · Search Arena를 확인합니다.</span></div>}
            {!modelInsightLoading && !modelInsights && <div className="model-lab-loading"><b>평가 정보를 불러오지 못했어요.</b><span>잠시 뒤 순위 새로고침을 눌러주세요.</span></div>}

            <div className="model-insight-grid">
              {visibleModelInsights.map((model) => {
                const metrics = arenaMetricOrder.filter((item) => model.arena[item.id]).slice(0, model.intelligenceIndex == null ? 4 : 3);
                const availability = model.availability === "router" ? "라우터 대상" : model.availability === "watchlist" ? "관심 모델" : "창작 전용";
                return (
                  <article className={`model-insight-card ${model.availability}`} key={model.id}>
                    <div className="model-card-head">
                      <i>{model.mark}</i>
                      <div><small>{model.provider}</small><h3>{model.name}</h3></div>
                      <span>{availability}</span>
                    </div>
                    <p className="model-summary">{model.summary}</p>

                    <div className="model-metrics">
                      {model.intelligenceIndex != null && <span><small>AA 지능 지표</small><b>{model.intelligenceIndex}</b><em>{model.intelligenceNote}</em></span>}
                      {metrics.map(({ id, label }) => {
                        const metric = model.arena[id]!;
                        return <span key={id} title={`${metric.modelName} · ${metric.sampleCount.toLocaleString("ko-KR")} samples`}><small>{label} Arena</small><b>#{metric.rank}</b><em>{metric.scoreLabel} · {metric.publishedAt.slice(5)}</em></span>;
                      })}
                      {metrics.length === 0 && model.intelligenceIndex == null && <span className="no-arena"><small>Arena</small><b>—</b><em>현재 공식 매칭 없음</em></span>}
                    </div>

                    <div className="model-best-for">{model.bestFor.map((item) => <span key={item}>{item}</span>)}</div>
                    <div className="model-tradeoffs">
                      <div><b>잘하는 것</b>{model.strengths.map((item) => <p key={item}>+ {item}</p>)}</div>
                      <div><b>약한 것</b>{model.weaknesses.map((item) => <p key={item}>− {item}</p>)}</div>
                    </div>
                    <footer><span>{model.context}</span><span>{model.price}</span><a href={model.officialUrl} target="_blank" rel="noreferrer">공식 정보 ↗</a></footer>
                  </article>
                );
              })}
            </div>

            {modelInsights && <div className="model-lab-sources"><p>{modelInsights.caveat}</p><div><span>출처</span>{modelInsights.sources.map((source) => <a href={source.url} target="_blank" rel="noreferrer" title={source.note} key={source.name}>{source.name} ↗</a>)}</div></div>}
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="모델 및 구독" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setSettingsOpen(false)} aria-label="닫기">×</button>
            <header><p>Model router · 2026.07</p><h2>Terracotta Auto</h2><span>작업에 맞는 모델을 고르고, GPT와 Claude의 우선순위는 내가 정합니다.</span></header>

            <button className="model-lab-entry" type="button" onClick={openModelLab}><span>◫</span><div><b>모델 연구소 열기</b><small>최신 모델의 장단점, 아레나 순위와 작업별 평가를 비교하세요.</small></div><em>비교하기 →</em></button>

            <div className="router-runtime">
              <div><i className={registryStatus?.connections.some((item) => item.configured) ? "online" : ""} /><span><b>{registryStatus?.latestPrimary?.model ?? "레지스트리 확인 중"}</b><small>{registryStatus ? `${registryStatus.syncIntervalHours}시간마다 공식 모델 목록 자동 갱신` : "백엔드 연결 상태를 불러오고 있어요"}</small></span></div>
              <div><b>${(registryStatus?.monthlyUsage.costUsd ?? 0).toFixed(2)}</b><small>이번 달 공급 원가 / ${registryStatus?.monthlyUsage.budgetUsd ?? 24}</small></div>
              <button onClick={() => void loadRegistry(true)} disabled={registryLoading}>{registryLoading ? "확인 중" : "지금 갱신"}</button>
            </div>

            <section className="settings-section priority-section" aria-labelledby="priority-title">
              <div className="settings-heading"><div><h3 id="priority-title">기본 우선순위</h3><p>선택은 개인 레지스트리와 이 기기에 저장돼요.</p></div><span>{routingOrder.primary}가 먼저 작업</span></div>
              <div className="priority-options">
                {preferenceOptions.map((option) => (
                  <button key={option.id} className={modelPreference === option.id ? "active" : ""} onClick={() => setModelPreference(option.id)} aria-pressed={modelPreference === option.id}>
                    <span>{modelPreference === option.id ? "●" : "○"}</span><b>{option.title}</b><small>{option.description}</small>
                  </button>
                ))}
              </div>
              <p className="router-note"><i /> 최신 우선은 OpenAI와 Anthropic의 공식 모델 생성 시각을 비교해 자동 전환합니다. 키가 연결되기 전에는 검증된 기본 목록을 사용합니다.</p>
            </section>

            <section className="settings-section" aria-labelledby="models-title">
              <div className="settings-heading"><div><h3 id="models-title">연결 모델</h3><p>하나의 작업 안에서도 필요한 모델만 조합합니다.</p></div><span>4개 공급사 · 5개 핵심 모델</span></div>
              <div className="simple-models">{modelCatalog.map((model) => {
                const provider = model.provider;
                const connection = registryStatus?.connections.find((item) => item.provider === provider);
                const liveModel = model.id === "claude" ? null : registryStatus?.models.find((item) => item.provider === provider);
                const status = connection?.status === "connected" || connection?.status === "mcp_connected" ? "실제 연결됨" : connection?.status === "mcp_auth_required" ? "MCP 인증 필요" : connection?.status === "error" ? "연결 오류" : "API 키 필요";
                return <span key={model.id}><i>{model.mark}</i><span><b>{liveModel?.name ?? model.name}</b><small>{model.role}</small></span><em className={connection?.configured ? "connected" : ""}>{status}</em></span>;
              })}</div>
              <p className="connection-note">API 키는 브라우저나 D1에 저장하지 않고 암호화된 서버 환경변수로만 사용합니다. Higgsfield는 공식 정책에 따라 API 키 대신 계정 인증 MCP로 연결됩니다.</p>
            </section>

            <section className="settings-section pricing-section" aria-labelledby="pricing-title">
              <div className="settings-heading"><div><h3 id="pricing-title">구독 출시 가안</h3><p>모든 플랜에서 GPT, Claude, Perplexity, Higgsfield를 사용할 수 있어요.</p></div><span>월간 · VAT 별도</span></div>
              <div className="cost-benchmarks">
                <span><b>GPT-5.6 Sol</b><small>$5 입력 · $30 출력 / 1M</small></span>
                <span><b>Claude Fable 5</b><small>$10 입력 · $50 출력 / 1M</small></span>
                <span><b>Claude Sonnet 5</b><small>$2 입력 · $10 출력 / 1M*</small></span>
                <span><b>Sonar Pro</b><small>$3 입력 · $15 출력 / 1M + 검색</small></span>
                <span><b>Higgsfield</b><small>$9 · $49 · $129 크레딧 플랜</small></span>
              </div>
              <div className="plan-grid">
                {subscriptionPlans.map((plan) => (
                  <article key={plan.name} className={plan.recommended ? "recommended" : ""}>
                    {plan.recommended && <span className="plan-badge">추천</span>}
                    <h4>{plan.name}</h4><p>{plan.description}</p>
                    <strong>₩{plan.price}<small>/월</small></strong>
                    <dl><div><dt>통합 크레딧</dt><dd>{plan.credits}</dd></div><div><dt>공급 원가 예산</dt><dd>{plan.cost}</dd></div></dl>
                    <small className="plan-example">{plan.examples}</small>
                  </article>
                ))}
              </div>
              <p className="pricing-note">짧은 텍스트는 적게, 심층 리서치·영상·Fable 5 최고 난도 작업은 많이 차감됩니다. 소비자용 구독을 재판매하는 금액이 아니라 API·생성 크레딧, 환율 버퍼, 라우팅·개인 메모리·저장 비용을 포함한 출시 가격입니다. *Sonnet 5의 프로모션 가격은 2026년 8월 31일까지이며 이후 원가 예산에 $3/$15 단가를 반영합니다.</p>
              <div className="pricing-sources"><span>공식 가격 확인</span><a href="https://developers.openai.com/api/docs/models" target="_blank" rel="noreferrer">OpenAI</a><a href="https://www.anthropic.com/news/claude-sonnet-5" target="_blank" rel="noreferrer">Anthropic</a><a href="https://docs.perplexity.ai/docs/getting-started/pricing" target="_blank" rel="noreferrer">Perplexity</a><a href="https://higgsfield.ai/pricing" target="_blank" rel="noreferrer">Higgsfield</a></div>
            </section>
            <button className="settings-save" onClick={() => setSettingsOpen(false)}>확인</button>
          </section>
        </div>
      )}
    </main>
  );
}
