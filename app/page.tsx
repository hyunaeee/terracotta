"use client";

import { FormEvent, KeyboardEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import type { ArenaCategory, ModelInsight } from "@/lib/model-intelligence";

const quickPrompts = [
  "오늘 회의 내용을 정리해줘",
  "이번 주에 배운 것을 복습해줘",
  "새 프로젝트 아이디어를 같이 생각해줘",
];

type ModelPreference = "latest" | "gpt" | "claude" | "gemini";
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
  { id: "gemini", provider: "google", mark: "M", name: "Gemini 3.6 Flash", role: "멀티모달 · 빠른 에이전트" },
  { id: "perplexity", provider: "perplexity", mark: "P", name: "Perplexity Sonar Pro", role: "웹 검색 · 리서치" },
  { id: "higgsfield", provider: "higgsfield", mark: "H", name: "Higgsfield", role: "이미지 · 영상" },
];

const preferenceOptions: { id: ModelPreference; title: string; description: string }[] = [
  { id: "latest", title: "최신 모델 우선", description: "공식 최신 목록이 바뀌면 GPT와 Claude의 순서를 자동으로 바꿔요." },
  { id: "gpt", title: "GPT 우선", description: "GPT를 먼저 쓰고, Gemini와 Claude가 검토하거나 이어받아요." },
  { id: "claude", title: "Claude 우선", description: "Claude를 먼저 쓰고, Gemini와 GPT가 검토하거나 이어받아요." },
  { id: "gemini", title: "Gemini 우선", description: "Gemini를 먼저 쓰고, GPT와 Claude가 검토하거나 이어받아요." },
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

type OrchestrationStep = { type: "route" | "tool" | "review" | "handoff"; label: string; status: "done" | "approval" | "error" };
type ApprovalRequest = {
  id: string;
  summary: string;
  expiresAt: string;
  actions: Array<{ service: string; tool: string; arguments: Record<string, unknown> }>;
  status?: "pending" | "running" | "approved" | "rejected";
};
type SessionRole = "owner" | "editor" | "viewer";
type Message = { role: "user" | "assistant"; text: string; author?: string; models?: string; trace?: OrchestrationStep[]; approval?: ApprovalRequest };
type ContextSession = { id: string; projectId?: string | null; title: string; lastProvider: string | null; ownerEmail?: string; role?: SessionRole };
type TeamMember = { email: string; role: SessionRole; invitedBy: string | null; createdAt: string };
type TeamHandoff = { id: string; fromEmail: string; toEmail: string; note: string; status: "pending" | "accepted"; createdAt: string };
type ModelHandoff = { id: string; from: string; to: string; createdAt: string };
type WorkspaceProject = {
  id: string;
  name: string;
  description: string;
  agentId: string | null;
  rootPath: string;
  instructions: string;
  modelPreference: ModelPreference;
  fileAccess: "read-only" | "read-write";
  commandAccess: "disabled" | "approval";
  color: string;
  updatedAt: string;
};
type ProjectActivity = { id: string; action: string; path: string | null; status: string; summary: string; created_at: string };
type ProjectFile = { path: string; type: "file" | "directory"; size: number; modifiedAt: string };
type ProjectDocument = { path: string; content: string; hash: string; size: number; modifiedAt: string };
type ProjectSearchMatch = { path: string; line: number | null; preview: string };
type ContextPayload = {
  currentUser: string;
  selectedProjectId: string | null;
  session: ContextSession | null;
  messages: Message[];
  members: TeamMember[];
  handoffs: TeamHandoff[];
  modelHandoffs: ModelHandoff[];
  projects: WorkspaceProject[];
  recentSessions: ContextSession[];
  error?: string;
};
type AssistantPayload = {
  text?: string;
  model?: string;
  provider?: string;
  costUsd?: number;
  error?: string;
  code?: string;
  approvalRequired?: boolean;
  approval?: ApprovalRequest;
  orchestration?: { runId: string; trace: OrchestrationStep[]; reviewedBy?: string };
  context?: { sessionId: string; projectId: string | null; title: string; lastProvider: string; handoff?: { from: string; to: string; label: string } };
};
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
type LocalAgent = {
  id: string;
  name: string;
  platform: string | null;
  shell: string | null;
  workspace: string | null;
  online: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};
type LocalAgentJob = {
  id: string;
  agentId: string;
  projectId?: string | null;
  operation?: string;
  command: string;
  cwd: string;
  status: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  changedFiles?: Array<{ path?: string; action?: string }>;
  createdAt: string;
  completedAt: string | null;
};
type LocalAgentDashboard = {
  agents: LocalAgent[];
  jobs: LocalAgentJob[];
  connected: boolean;
  error?: string;
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<WorkspaceProject[]>([]);
  const [modelHandoffs, setModelHandoffs] = useState<ModelHandoff[]>([]);
  const [sessionTitle, setSessionTitle] = useState("새 작업");
  const [lastContextProvider, setLastContextProvider] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<ContextSession[]>([]);
  const [contextLoading, setContextLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState("owner");
  const [sessionRole, setSessionRole] = useState<SessionRole>("owner");
  const [sessionOwner, setSessionOwner] = useState("owner");
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamHandoffs, setTeamHandoffs] = useState<TeamHandoff[]>([]);
  const [teamOpen, setTeamOpen] = useState(false);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamMessage, setTeamMessage] = useState("팀원을 초대하거나 편집 가능한 팀원에게 작업을 넘길 수 있어요.");
  const [teamForm, setTeamForm] = useState<{ email: string; role: "editor" | "viewer"; note: string }>({ email: "", role: "editor", note: "" });
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
  const [localAgentOpen, setLocalAgentOpen] = useState(false);
  const [localAgents, setLocalAgents] = useState<LocalAgent[]>([]);
  const [localAgentJobs, setLocalAgentJobs] = useState<LocalAgentJob[]>([]);
  const [localAgentBusy, setLocalAgentBusy] = useState(false);
  const [localAgentName, setLocalAgentName] = useState("내 컴퓨터");
  const [localAgentToken, setLocalAgentToken] = useState<string | null>(null);
  const [localAgentPlatform, setLocalAgentPlatform] = useState<"windows" | "mac">("windows");
  const [localAgentNote, setLocalAgentNote] = useState("연결 후 채팅에서 파일 수정·빌드·테스트를 요청할 수 있어요.");
  const [projectOpen, setProjectOpen] = useState(false);
  const [projectTab, setProjectTab] = useState<"overview" | "files" | "changes">("overview");
  const [projectEditingId, setProjectEditingId] = useState<string | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);
  const [projectNote, setProjectNote] = useState("컴퓨터와 폴더를 연결하면 모델이 프로젝트 안에서만 작업합니다.");
  const [projectForm, setProjectForm] = useState({ name: "", description: "", agentId: "", rootPath: ".", instructions: "", modelPreference: "latest" as ModelPreference, fileAccess: "read-write" as "read-only" | "read-write", commandAccess: "approval" as "disabled" | "approval" });
  const [projectFiles, setProjectFiles] = useState<ProjectFile[]>([]);
  const [projectFile, setProjectFile] = useState<ProjectDocument | null>(null);
  const [projectFileContent, setProjectFileContent] = useState("");
  const [projectFilePath, setProjectFilePath] = useState("");
  const [projectSearchQuery, setProjectSearchQuery] = useState("");
  const [projectSearchResults, setProjectSearchResults] = useState<ProjectSearchMatch[]>([]);
  const [projectDiff, setProjectDiff] = useState({ status: "", diff: "", staged: "" });
  const [projectActivities, setProjectActivities] = useState<ProjectActivity[]>([]);
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
    if (savedPreference === "latest" || savedPreference === "gpt" || savedPreference === "claude" || savedPreference === "gemini") {
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
    void loadWorkContext();
  }, [ready]);

  function applyContextPayload(payload: ContextPayload, replaceMessages = true) {
    setCurrentUser(payload.currentUser || "owner");
    setProjects(payload.projects ?? []);
    setProjectId(payload.session?.projectId ?? payload.selectedProjectId ?? null);
    setSessionId(payload.session?.id ?? null);
    setSessionTitle(payload.session?.title ?? "새 작업");
    setSessionOwner(payload.session?.ownerEmail ?? payload.currentUser ?? "owner");
    setSessionRole(payload.session?.role ?? "owner");
    setLastContextProvider(payload.session?.lastProvider ?? null);
    if (replaceMessages) setMessages(payload.messages ?? []);
    setTeamMembers(payload.members ?? []);
    setTeamHandoffs(payload.handoffs ?? []);
    setModelHandoffs(payload.modelHandoffs ?? []);
    setRecentSessions(payload.recentSessions ?? []);
    const selected = (payload.projects ?? []).find((project) => project.id === (payload.session?.projectId ?? payload.selectedProjectId));
    if (selected) setModelPreference(selected.modelPreference);
  }

  async function loadWorkContext(targetSessionId?: string, targetProjectId?: string | null) {
    setContextLoading(true);
    try {
      const params = new URLSearchParams();
      if (targetSessionId) params.set("sessionId", targetSessionId);
      else if (targetProjectId) params.set("projectId", targetProjectId);
      const query = params.size ? `?${params.toString()}` : "";
      const response = await fetch(`/api/context${query}`, { cache: "no-store" });
      if (!response.ok) throw new Error("context unavailable");
      applyContextPayload(await response.json() as ContextPayload);
      setMobileMenu(false);
    } catch {
      setSessionId(null);
    } finally {
      setContextLoading(false);
    }
  }

  async function runTeamAction(body: Record<string, unknown>) {
    if (!sessionId || teamBusy) return null;
    setTeamBusy(true);
    try {
      const response = await fetch("/api/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, sessionId }) });
      const payload = await response.json() as ContextPayload;
      if (!response.ok) throw new Error(payload.error || "팀 공유 설정을 저장하지 못했어요.");
      applyContextPayload(payload);
      return payload;
    } catch (error) {
      setTeamMessage(error instanceof Error ? error.message : "팀 공유 설정을 저장하지 못했어요.");
      return null;
    } finally {
      setTeamBusy(false);
    }
  }

  async function submitTeamShare(event: FormEvent) {
    event.preventDefault();
    if (!teamForm.email.trim()) return;
    const action = sessionRole === "owner" ? "share" : "handoff";
    const payload = await runTeamAction({ action, email: teamForm.email, role: teamForm.role, note: teamForm.note });
    if (!payload) return;
    setTeamMessage(sessionRole === "owner"
      ? (teamForm.note.trim() && teamForm.role === "editor" ? "팀원을 초대하고 작업 인계 메모를 남겼어요." : "팀원의 공유 권한을 저장했어요.")
      : "팀원에게 작업을 넘겼어요.");
    setTeamForm({ email: "", role: "editor", note: "" });
  }

  async function revokeTeamMember(email: string) {
    const payload = await runTeamAction({ action: "revoke", email });
    if (payload) setTeamMessage(`${email}의 공유 권한을 해제했어요.`);
  }

  async function acceptHandoff(handoffId: string) {
    const payload = await runTeamAction({ action: "accept", handoffId });
    if (payload) {
      setTeamMessage("작업을 이어받았어요. 같은 기록에서 바로 계속할 수 있습니다.");
      setTeamOpen(false);
    }
  }

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

  async function loadLocalAgents() {
    setLocalAgentBusy(true);
    try {
      const response = await fetch("/api/local-agent", { cache: "no-store" });
      const payload = await response.json() as LocalAgentDashboard;
      if (!response.ok) throw new Error(payload.error || "로컬 연결을 불러오지 못했어요.");
      setLocalAgents(payload.agents ?? []);
      setLocalAgentJobs(payload.jobs ?? []);
      if (payload.connected) setLocalAgentNote("로컬 터미널이 온라인입니다. 채팅에서 필요한 작업을 요청하세요.");
    } catch (error) {
      setLocalAgentNote(error instanceof Error ? error.message : "로컬 연결을 불러오지 못했어요.");
    } finally {
      setLocalAgentBusy(false);
    }
  }

  function openLocalAgent() {
    setLocalAgentOpen(true);
    setMobileMenu(false);
    void loadLocalAgents();
  }

  async function pairLocalAgent() {
    if (localAgentBusy) return;
    setLocalAgentBusy(true);
    try {
      const response = await fetch("/api/local-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pair", name: localAgentName }),
      });
      const payload = await response.json() as { token?: string; error?: string };
      if (!response.ok || !payload.token) throw new Error(payload.error || "연결 키를 만들지 못했어요.");
      setLocalAgentToken(payload.token);
      setLocalAgentNote("한 번만 표시되는 연결 키를 만들었어요. 아래 명령을 연결할 컴퓨터에서 실행하세요.");
      await loadLocalAgents();
    } catch (error) {
      setLocalAgentNote(error instanceof Error ? error.message : "연결 키를 만들지 못했어요.");
    } finally {
      setLocalAgentBusy(false);
    }
  }

  async function revokeLocalAgent(id: string) {
    setLocalAgentBusy(true);
    try {
      const response = await fetch("/api/local-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke", id }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "연결을 해제하지 못했어요.");
      setLocalAgentNote("해당 컴퓨터의 연결 키와 대기 작업을 해제했어요.");
      await loadLocalAgents();
    } catch (error) {
      setLocalAgentNote(error instanceof Error ? error.message : "연결을 해제하지 못했어요.");
    } finally {
      setLocalAgentBusy(false);
    }
  }

  function formForProject(project?: WorkspaceProject | null) {
    return project ? {
      name: project.name,
      description: project.description,
      agentId: project.agentId ?? "",
      rootPath: project.rootPath,
      instructions: project.instructions,
      modelPreference: project.modelPreference,
      fileAccess: project.fileAccess,
      commandAccess: project.commandAccess,
    } : { name: "", description: "", agentId: localAgents.find((agent) => agent.online)?.id ?? "", rootPath: ".", instructions: "", modelPreference: "latest" as ModelPreference, fileAccess: "read-write" as const, commandAccess: "approval" as const };
  }

  async function loadProjectDetails(targetProjectId: string) {
    setProjectBusy(true);
    try {
      const response = await fetch(`/api/projects?projectId=${encodeURIComponent(targetProjectId)}`, { cache: "no-store" });
      const payload = await response.json() as { projects?: WorkspaceProject[]; project?: WorkspaceProject; agents?: LocalAgent[]; activities?: ProjectActivity[]; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "프로젝트를 불러오지 못했어요.");
      setProjects(payload.projects ?? []);
      setLocalAgents(payload.agents ?? []);
      setProjectActivities(payload.activities ?? []);
      setProjectEditingId(payload.project.id);
      setProjectForm(formForProject(payload.project));
    } catch (error) {
      setProjectNote(error instanceof Error ? error.message : "프로젝트를 불러오지 못했어요.");
    } finally {
      setProjectBusy(false);
    }
  }

  function openProjectWorkspace(targetProjectId: string | null = projectId, tab: "overview" | "files" | "changes" = "overview") {
    setProjectOpen(true);
    setProjectTab(tab);
    setMobileMenu(false);
    setProjectFile(null);
    setProjectFileContent("");
    setProjectSearchResults([]);
    if (targetProjectId) void loadProjectDetails(targetProjectId);
    else {
      setProjectEditingId(null);
      setProjectForm(formForProject(null));
      setProjectActivities([]);
      void loadLocalAgents();
    }
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault();
    if (!projectForm.name.trim() || projectBusy) return;
    setProjectBusy(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: projectEditingId ? "update" : "create", projectId: projectEditingId, ...projectForm }),
      });
      const payload = await response.json() as { project?: WorkspaceProject; error?: string };
      if (!response.ok || !payload.project) throw new Error(payload.error || "프로젝트를 저장하지 못했어요.");
      setProjectEditingId(payload.project.id);
      setProjectId(payload.project.id);
      setProjectForm(formForProject(payload.project));
      setProjects((items) => [payload.project!, ...items.filter((item) => item.id !== payload.project!.id)]);
      setModelPreference(payload.project.modelPreference);
      setProjectNote("프로젝트 설정을 저장했어요. 이제 이 프로젝트의 대화와 파일 작업이 한곳에 모입니다.");
      await loadWorkContext(undefined, payload.project.id);
    } catch (error) {
      setProjectNote(error instanceof Error ? error.message : "프로젝트를 저장하지 못했어요.");
    } finally {
      setProjectBusy(false);
    }
  }

  async function archiveProject() {
    if (!projectEditingId || projectBusy) return;
    setProjectBusy(true);
    try {
      const response = await fetch("/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "archive", projectId: projectEditingId }) });
      if (!response.ok) throw new Error("프로젝트를 보관하지 못했어요.");
      setProjects((items) => items.filter((item) => item.id !== projectEditingId));
      if (projectId === projectEditingId) setProjectId(null);
      setProjectEditingId(null);
      setProjectForm(formForProject(null));
      setProjectNote("프로젝트를 보관했어요. 대화와 실행 기록은 삭제하지 않았습니다.");
    } catch (error) {
      setProjectNote(error instanceof Error ? error.message : "프로젝트를 보관하지 못했어요.");
    } finally {
      setProjectBusy(false);
    }
  }

  async function projectFileRequest(action: "list" | "read" | "search" | "diff" | "write", input: Record<string, unknown> = {}) {
    if (!projectEditingId) throw new Error("프로젝트를 먼저 선택해 주세요.");
    const response = await fetch("/api/projects/files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: projectEditingId, action, ...input }) });
    const payload = await response.json() as { output?: unknown; job?: { status?: string; stderr?: string }; error?: string };
    if (!response.ok && response.status !== 202) throw new Error(payload.error || payload.job?.stderr || "로컬 파일 작업을 처리하지 못했어요.");
    if (response.status === 202) setProjectNote("로컬 컴퓨터에서 작업 중입니다. 잠시 뒤 다시 확인해 주세요.");
    return payload.output;
  }

  async function loadProjectFiles() {
    setProjectBusy(true);
    try {
      const output = await projectFileRequest("list", { path: ".", maxDepth: 6 }) as { files?: ProjectFile[] } | null;
      setProjectFiles(output?.files ?? []);
      setProjectNote(`${output?.files?.length ?? 0}개 파일과 폴더를 안전 범위 안에서 불러왔어요.`);
    } catch (error) { setProjectNote(error instanceof Error ? error.message : "파일 목록을 불러오지 못했어요."); }
    finally { setProjectBusy(false); }
  }

  async function openProjectFile(path: string) {
    setProjectBusy(true);
    try {
      const output = await projectFileRequest("read", { path }) as ProjectDocument | null;
      if (!output?.path) throw new Error("파일 내용을 받지 못했어요.");
      setProjectFile(output); setProjectFileContent(output.content); setProjectFilePath(output.path);
    } catch (error) { setProjectNote(error instanceof Error ? error.message : "파일을 열지 못했어요."); }
    finally { setProjectBusy(false); }
  }

  function newProjectFile() {
    const path = projectFilePath.trim();
    if (!path) { setProjectNote("새 파일의 프로젝트 기준 경로를 먼저 입력해 주세요."); return; }
    setProjectFile({ path, content: "", hash: "", size: 0, modifiedAt: "" });
    setProjectFileContent("");
  }

  async function saveProjectFile() {
    if (!projectFile || projectBusy) return;
    setProjectBusy(true);
    try {
      const output = await projectFileRequest("write", { path: projectFile.path, content: projectFileContent, expectedHash: projectFile.hash || undefined, confirmed: true }) as { path?: string; hash?: string } | null;
      setProjectFile((current) => current ? { ...current, content: projectFileContent, hash: output?.hash ?? current.hash, size: new TextEncoder().encode(projectFileContent).length } : current);
      setProjectNote(`${output?.path ?? projectFile.path} 저장을 완료했어요. 변경 기록에도 남겼습니다.`);
      await loadProjectFiles();
    } catch (error) { setProjectNote(error instanceof Error ? error.message : "파일을 저장하지 못했어요."); }
    finally { setProjectBusy(false); }
  }

  async function searchProjectFiles(event: FormEvent) {
    event.preventDefault();
    if (!projectSearchQuery.trim()) return;
    setProjectBusy(true);
    try {
      const output = await projectFileRequest("search", { query: projectSearchQuery, maxResults: 60 }) as { matches?: ProjectSearchMatch[] } | null;
      setProjectSearchResults(output?.matches ?? []);
      setProjectNote(`${output?.matches?.length ?? 0}개 검색 결과를 찾았어요.`);
    } catch (error) { setProjectNote(error instanceof Error ? error.message : "프로젝트 검색을 마치지 못했어요."); }
    finally { setProjectBusy(false); }
  }

  async function loadProjectChanges() {
    setProjectBusy(true);
    try {
      const output = await projectFileRequest("diff") as { status?: string; diff?: string; staged?: string } | null;
      setProjectDiff({ status: output?.status ?? "", diff: output?.diff ?? "", staged: output?.staged ?? "" });
      await loadProjectDetails(projectEditingId!);
    } catch (error) { setProjectNote(error instanceof Error ? error.message : "변경 내역을 불러오지 못했어요."); }
    finally { setProjectBusy(false); }
  }

  async function selectProject(targetProjectId: string) {
    const project = projects.find((item) => item.id === targetProjectId);
    setProjectId(targetProjectId);
    if (project) setModelPreference(project.modelPreference);
    await loadWorkContext(undefined, targetProjectId);
    setProjectOpen(false);
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
    const gemini = registryStatus?.models.find((model) => model.provider === "google")?.name ?? "Gemini 3.6 Flash";
    if (modelPreference === "gemini") return { primary: gemini, backup: registryStatus?.models.find((model) => model.provider === "openai")?.name ?? "GPT-5.6" };
    if (modelPreference === "claude") return { primary: registryStatus?.models.find((model) => model.provider === "anthropic")?.name ?? "Claude Fable 5", backup: gemini };
    if (modelPreference === "latest" && registryStatus?.latestPrimary?.provider === "anthropic") return { primary: registryStatus.latestPrimary.model, backup: gemini };
    if (modelPreference === "latest" && registryStatus?.latestPrimary?.provider === "google") return { primary: registryStatus.latestPrimary.model, backup: registryStatus.models.find((model) => model.provider === "openai")?.name ?? "GPT" };
    if (modelPreference === "latest" && registryStatus?.latestPrimary?.provider === "openai") return { primary: registryStatus.latestPrimary.model, backup: gemini };
    return { primary: "GPT-5.6", backup: gemini };
  }, [modelPreference, registryStatus]);

  const preferenceLabel = modelPreference === "latest" ? "최신 우선" : modelPreference === "gpt" ? "GPT 우선" : modelPreference === "claude" ? "Claude 우선" : "Gemini 우선";
  const activeProject = projects.find((project) => project.id === projectId) ?? null;
  const visibleRecentSessions = recentSessions.filter((session) => activeProject ? session.projectId === activeProject.id : !session.projectId);

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
  const localAgentOrigin = ready && typeof window !== "undefined" ? window.location.origin : "https://your-terracotta.example";
  const localAgentCommand = localAgentToken
    ? localAgentPlatform === "windows"
      ? `Invoke-WebRequest "${localAgentOrigin}/terracotta-local-agent.mjs" -OutFile ".\\terracotta-local-agent.mjs"\nnode .\\terracotta-local-agent.mjs --server "${localAgentOrigin}" --token "${localAgentToken}" --workspace .`
      : `curl -fsSL "${localAgentOrigin}/terracotta-local-agent.mjs" -o terracotta-local-agent.mjs\nnode ./terracotta-local-agent.mjs --server "${localAgentOrigin}" --token "${localAgentToken}" --workspace .`
    : "";
  const mcpCategories = useMemo(() => ["전체", ...Array.from(new Set(mcpConnections.map((item) => item.category)))], [mcpConnections]);
  const visibleMcpConnections = useMemo(() => {
    const query = mcpQuery.trim().toLowerCase();
    return mcpConnections.filter((item) => (mcpCategory === "전체" || item.category === mcpCategory) && (!query || `${item.name} ${item.note} ${item.category}`.toLowerCase().includes(query)));
  }, [mcpCategory, mcpConnections, mcpQuery]);
  const setupConnection = mcpConnections.find((item) => item.id === mcpSetupId) ?? null;
  const canEditSession = sessionRole !== "viewer";
  const pendingTeamHandoff = teamHandoffs.find((handoff) => handoff.status === "pending" && handoff.toEmail === currentUser) ?? null;
  const handoffTargets = teamMembers.filter((member) => member.email !== currentUser && (member.role === "owner" || member.role === "editor"));

  function assistantGuidance(payload: AssistantPayload) {
    if (payload.code === "HIGGSFIELD_MCP_AUTH_REQUIRED") return "이미지·영상 생성 MCP를 연결하면 창작 요청도 자동 실행할 수 있어요.";
    if (payload.code === "PROVIDER_KEY_REQUIRED") return "오케스트레이터는 준비됐어요. OpenAI, Anthropic, Gemini 또는 Perplexity API 키를 연결하면 실제 작업을 시작합니다.";
    if (payload.code === "BUDGET_EXHAUSTED") return "이번 달 공급사 원가 예산에 도달했어요. 예산을 조정한 뒤 다시 시도해 주세요.";
    return payload.error ?? "연결된 모델이나 도구가 잠시 응답하지 않았어요.";
  }

  function addAssistantResult(payload: AssistantPayload, fallbackModel: string) {
    const trace = payload.orchestration?.trace ?? [];
    if (payload.context) {
      setSessionId(payload.context.sessionId);
      setProjectId(payload.context.projectId);
      setSessionTitle(payload.context.title);
      setLastContextProvider(payload.context.lastProvider);
      setRecentSessions((items) => [
        { ...items.find((item) => item.id === payload.context!.sessionId), id: payload.context!.sessionId, projectId: payload.context!.projectId, title: payload.context!.title, lastProvider: payload.context!.lastProvider },
        ...items.filter((item) => item.id !== payload.context!.sessionId),
      ].slice(0, 8));
    }
    if (payload.approvalRequired && payload.approval) {
      setMessages((items) => [...items, {
        role: "assistant",
        text: payload.approval!.summary,
        models: `${payload.model ?? fallbackModel} · 실행 전 승인 대기`,
        trace,
        approval: { ...payload.approval!, status: "pending" },
      }]);
      return;
    }
    const usedTools = trace.filter((item) => item.type === "tool" && item.status === "done").length;
    const reviewed = payload.orchestration?.reviewedBy ? ` · ${payload.orchestration.reviewedBy} 검토` : "";
    const toolLabel = usedTools ? ` · 도구 ${usedTools}개` : "";
    setMessages((items) => [...items, {
      role: "assistant",
      text: payload.text ?? "답변을 준비했어요.",
      models: `${payload.model ?? fallbackModel}${toolLabel}${reviewed} · 실제 API${typeof payload.costUsd === "number" ? ` · $${payload.costUsd.toFixed(4)}` : ""}`,
      trace,
    }]);
    setSparks((value) => value + 36);
    setGrowth((value) => value + 1);
    setGardenNote("방금 끝낸 작업이 새 지식으로 쌓였어요. 받은 Sparks로 정원을 꾸며보세요.");
    void loadRegistry();
  }

  async function submitTask(event: FormEvent) {
    event.preventDefault();
    const task = prompt.trim();
    if (!task || isWorking || !canEditSession) return;
    const team = selectedTeam;
    setMessages((items) => [...items, { role: "user", text: task }]);
    setPrompt("");
    setIsWorking(true);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: task, preference: modelPreference, sessionId, projectId }) });
      const payload = await response.json() as AssistantPayload;
      if (!response.ok) {
        setMessages((items) => [...items, { role: "assistant", text: assistantGuidance(payload), models: "연결 설정 필요" }]);
        return;
      }
      addAssistantResult(payload, team);
    } catch {
      setMessages((items) => [...items, { role: "assistant", text: "실제 모델 백엔드에 연결하지 못했어요. 잠시 뒤 다시 시도해 주세요.", models: "연결 오류" }]);
    } finally {
      setIsWorking(false);
    }
  }

  async function resolveToolApproval(approval: ApprovalRequest, decision: "approve" | "reject") {
    if (isWorking || !canEditSession || approval.status === "approved" || approval.status === "rejected") return;
    setIsWorking(true);
    setMessages((items) => items.map((message) => message.approval?.id === approval.id ? { ...message, approval: { ...message.approval, status: "running" } } : message));
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ approvalId: approval.id, decision }) });
      const payload = await response.json() as AssistantPayload;
      if (!response.ok) {
        setMessages((items) => items.map((message) => message.approval?.id === approval.id ? { ...message, approval: { ...message.approval, status: "pending" } } : message));
        setMessages((items) => [...items, { role: "assistant", text: assistantGuidance(payload), models: "승인 처리 오류" }]);
        return;
      }
      setMessages((items) => items.map((message) => message.approval?.id === approval.id ? { ...message, approval: { ...message.approval, status: decision === "approve" ? "approved" : "rejected" } } : message));
      addAssistantResult(payload, "Terracotta Auto");
    } catch {
      setMessages((items) => items.map((message) => message.approval?.id === approval.id ? { ...message, approval: { ...message.approval, status: "pending" } } : message));
      setMessages((items) => [...items, { role: "assistant", text: "승인 요청을 처리하지 못했어요. 잠시 뒤 다시 시도해 주세요.", models: "연결 오류" }]);
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
    return { left: `${position.x}%`, top: `${position.y}%`, zIndex: Math.round(2 + position.y / 10) };
  }

  async function newChat(targetProjectId: string | null = projectId) {
    setMessages([]);
    setPrompt("");
    setMobileMenu(false);
    setSessionTitle("새 작업");
    setLastContextProvider(null);
    setProjectId(targetProjectId);
    try {
      const response = await fetch("/api/context", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "new", projectId: targetProjectId }) });
      if (!response.ok) throw new Error("new context unavailable");
      applyContextPayload(await response.json() as ContextPayload);
    } catch {
      setSessionId(`new-${Date.now()}`);
    }
  }

  return (
    <main className="app-frame">
      <aside className={`sidebar ${mobileMenu ? "open" : ""}`}>
        <div className="sidebar-top">
          <button className="wordmark" onClick={() => void newChat()} aria-label="테라코타 홈">
            <TerracottaMark /> Terracotta
          </button>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="메뉴 닫기">×</button>
        </div>

        <button className="new-chat" onClick={() => void newChat()}><span>＋</span> {activeProject ? `${activeProject.name} 새 대화` : "새 대화"}</button>

        <nav className="sidebar-nav" aria-label="주요 메뉴">
          <button className="active" onClick={() => setMobileMenu(false)}><span>○</span> 대화</button>
          <button onClick={() => openProjectWorkspace()}><span>▦</span> 프로젝트</button>
          <button onClick={() => { setGardenOpen(true); setMobileMenu(false); }}><span>♧</span> 테라코타 가든</button>
          <button onClick={openMcpHub}><span>⌁</span> MCP 연결</button>
          <button onClick={openLocalAgent}><span>›_</span> 로컬 터미널</button>
          <button onClick={openModelLab}><span>◫</span> 모델 연구소</button>
          <button onClick={() => { setSettingsOpen(true); setMobileMenu(false); }}><span>⌘</span> 모델 및 구독</button>
        </nav>

        <div className="project-sidebar">
          <div><p>프로젝트</p><button onClick={() => openProjectWorkspace(null)} aria-label="새 프로젝트">＋</button></div>
          <button className={!activeProject ? "active" : ""} onClick={() => void newChat(null)}><i style={{ background: "#b8b8b1" }} />일반 대화</button>
          {projects.slice(0, 6).map((project) => (
            <button className={project.id === projectId ? "active" : ""} key={project.id} onClick={() => void selectProject(project.id)}><i style={{ background: project.color }} />{project.name}<small>{project.agentId ? "local" : "chat"}</small></button>
          ))}
        </div>

        <div className="recents">
          <p>{activeProject ? `${activeProject.name} 대화` : "일반 대화"}</p>
          {visibleRecentSessions.length ? visibleRecentSessions.map((session) => (
            <button className={session.id === sessionId ? "active" : ""} key={session.id} onClick={() => void loadWorkContext(session.id)}>{session.title}{session.role && session.role !== "owner" ? " · 공유됨" : ""}</button>
          )) : <small>{contextLoading ? "기억을 불러오는 중…" : "이 프로젝트에 아직 대화가 없어요."}</small>}
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
          <button className={`project-scope ${activeProject ? "active" : ""}`} onClick={() => openProjectWorkspace(activeProject?.id ?? null)}><i style={{ background: activeProject?.color ?? "#b8b8b1" }} />{activeProject?.name ?? "일반 대화"}<span>⌄</span></button>
          <span className="private-state"><i /> GPT · Claude · Gemini 공용 기억</span>
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
                    {message.role === "user" && message.author && message.author !== currentUser && <small className="team-author">{message.author}</small>}
                    <p>{message.text}</p>
                    {message.trace && message.trace.length > 0 && <div className="orchestration-trace" aria-label="Terracotta 작업 경로">{message.trace.map((step, stepIndex) => <span className={`${step.status} ${step.type}`} key={`${step.type}-${stepIndex}`}><i />{step.label}</span>)}</div>}
                    {message.approval && (
                      <section className={`tool-approval ${message.approval.status ?? "pending"}`} aria-label="외부 작업 승인">
                        <div className="tool-approval-head"><b>실행 전 확인</b><span>{message.approval.actions.length}개 작업</span></div>
                        {message.approval.actions.map((action, actionIndex) => (
                          <article key={`${action.service}-${action.tool}-${actionIndex}`}>
                            <div><b>{action.service}</b><small>{action.tool}</small></div>
                            <code>{JSON.stringify(action.arguments)}</code>
                          </article>
                        ))}
                        <p>승인하면 위 내용 그대로 실행하며, 인자 변경은 허용하지 않아요.</p>
                        <div className="tool-approval-actions">
                          <button type="button" className="approve" disabled={isWorking || !canEditSession || message.approval.status === "approved" || message.approval.status === "rejected"} onClick={() => void resolveToolApproval(message.approval!, "approve")}>{message.approval.status === "running" ? "처리 중" : message.approval.status === "approved" ? "승인 완료" : "승인하고 실행"}</button>
                          <button type="button" disabled={isWorking || !canEditSession || message.approval.status === "approved" || message.approval.status === "rejected"} onClick={() => void resolveToolApproval(message.approval!, "reject")}>{message.approval.status === "rejected" ? "실행 안 함" : "거절"}</button>
                        </div>
                      </section>
                    )}
                    {message.models && <small>{message.models}{message.approval ? "" : "로 함께 작업함 · 가든 +1"}</small>}
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
          <div className="context-bridge" aria-label="모델 공용 작업 기억">
            <div className="context-bridge-copy">
              <i />
              <span><b>{activeProject ? `${activeProject.name} / ${sessionTitle}` : sessionTitle}</b><small>{pendingTeamHandoff
                ? `${pendingTeamHandoff.fromEmail}님이 작업을 넘겼어요`
                : teamMembers.length > 1
                  ? `팀 작업 · ${teamMembers.length}명 · ${sessionRole === "viewer" ? "보기 전용" : "편집 가능"}`
                  : lastContextProvider
                    ? `${lastContextProvider === "openai" ? "GPT" : lastContextProvider === "anthropic" ? "Claude" : lastContextProvider === "google" ? "Gemini" : "Perplexity"}에서 이어갈 준비됨`
                    : modelHandoffs.length
                      ? `모델 컨텍스트 인계 ${modelHandoffs.length}회 · 같은 프로젝트 기억 사용`
                      : "GPT, Claude, Gemini가 같은 작업 기록을 사용해요"}</small></span>
            </div>
            <div className="context-bridge-actions">
              <button type="button" disabled={!canEditSession} className={modelPreference === "gpt" ? "active" : ""} onClick={() => setModelPreference("gpt")}>GPT로 이어하기</button>
              <button type="button" disabled={!canEditSession} className={modelPreference === "claude" ? "active" : ""} onClick={() => setModelPreference("claude")}>Claude로 이어하기</button>
              <button type="button" disabled={!canEditSession} className={modelPreference === "gemini" ? "active" : ""} onClick={() => setModelPreference("gemini")}>Gemini로 이어하기</button>
              <button type="button" className={pendingTeamHandoff ? "attention" : ""} onClick={() => setTeamOpen(true)}>팀 공유{teamMembers.length > 1 ? ` ${teamMembers.length}` : ""}</button>
              <button type="button" onClick={() => void newChat()}>새 작업</button>
            </div>
          </div>
          <form className="composer" onSubmit={submitTask}>
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={handleComposerKey}
              placeholder={canEditSession ? "테라코타에게 무엇이든 물어보세요" : "보기 전용 작업입니다"}
              aria-label="테라코타에게 보낼 메시지"
              disabled={!canEditSession}
              rows={1}
            />
            <div className="composer-actions">
              <div>
                <button type="button" aria-label="프로젝트 파일" onClick={() => openProjectWorkspace(activeProject?.id ?? null, activeProject ? "files" : "overview")}>＋</button>
                <button type="button" aria-label="웹 검색">◎</button>
              </div>
              <span>{selectedTeam}</span>
              <button className="send-button" disabled={!prompt.trim() || isWorking || !canEditSession} aria-label="메시지 보내기">↑</button>
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

      {teamOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setTeamOpen(false)}>
          <section className="dialog team-dialog" role="dialog" aria-modal="true" aria-label="팀 작업 공유" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setTeamOpen(false)} aria-label="닫기">×</button>
            <header><p>Team handoff</p><h2>같은 작업을 함께 키우기</h2><span>팀원도 같은 GPT·Claude·Gemini 기록과 도구 결과에서 바로 이어갈 수 있어요.</span></header>

            {pendingTeamHandoff && (
              <section className="incoming-handoff">
                <div><b>{pendingTeamHandoff.fromEmail}님이 작업을 넘겼어요</b><p>{pendingTeamHandoff.note}</p></div>
                <button type="button" disabled={teamBusy} onClick={() => void acceptHandoff(pendingTeamHandoff.id)}>이어받기</button>
              </section>
            )}

            <div className="team-access-note"><span>✓</span><p>초대한 이메일로 로그인한 팀원만 이 작업을 볼 수 있습니다. 현재 소유자 전용 사이트에서는 해당 팀원에게 사이트 접근 권한도 추가해야 해요.</p></div>

            <section className="team-member-section">
              <div className="team-section-head"><div><h3>함께 보는 사람</h3><p>{sessionOwner} 소유 · 현재 내 권한 {sessionRole === "owner" ? "소유자" : sessionRole === "editor" ? "편집" : "보기"}</p></div><b>{teamMembers.length}명</b></div>
              <div className="team-member-list">
                {teamMembers.map((member) => (
                  <article key={member.email}>
                    <span>{member.email.slice(0, 1).toUpperCase()}</span>
                    <div><b>{member.email}</b><small>{member.role === "owner" ? "소유자" : member.role === "editor" ? "편집 가능" : "보기 전용"}</small></div>
                    {sessionRole === "owner" && member.role !== "owner"
                      ? <button type="button" disabled={teamBusy} onClick={() => void revokeTeamMember(member.email)}>해제</button>
                      : member.email !== currentUser && member.role !== "viewer" && canEditSession
                        ? <button type="button" onClick={() => setTeamForm((value) => ({ ...value, email: member.email, role: "editor" }))}>넘기기</button>
                        : null}
                  </article>
                ))}
              </div>
            </section>

            {sessionRole !== "viewer" && (
              <form className="team-share-form" onSubmit={submitTeamShare}>
                <div className="team-section-head"><div><h3>{sessionRole === "owner" ? "팀원 초대 또는 인계" : "팀원에게 인계"}</h3><p>{sessionRole === "owner" ? "보기·편집 권한을 정하고, 선택적으로 인계 메모를 남기세요." : "편집 가능한 기존 팀원에게 현재 상태를 넘깁니다."}</p></div></div>
                {sessionRole === "owner" ? (
                  <div className="team-form-row">
                    <label><span>팀원 이메일</span><input type="email" required value={teamForm.email} onChange={(event) => setTeamForm((value) => ({ ...value, email: event.target.value }))} placeholder="teammate@company.com" /></label>
                    <label><span>권한</span><select value={teamForm.role} onChange={(event) => setTeamForm((value) => ({ ...value, role: event.target.value as "editor" | "viewer" }))}><option value="editor">편집 가능</option><option value="viewer">보기 전용</option></select></label>
                  </div>
                ) : (
                  <label><span>넘겨받을 팀원</span><select required value={teamForm.email} onChange={(event) => setTeamForm((value) => ({ ...value, email: event.target.value }))}><option value="">팀원 선택</option>{handoffTargets.map((member) => <option value={member.email} key={member.email}>{member.email}</option>)}</select></label>
                )}
                <label><span>인계 메모 {sessionRole === "owner" ? "(선택)" : ""}</span><textarea value={teamForm.note} disabled={sessionRole === "owner" && teamForm.role === "viewer"} required={sessionRole !== "owner"} onChange={(event) => setTeamForm((value) => ({ ...value, note: event.target.value }))} placeholder={teamForm.role === "viewer" ? "보기 전용 팀원에게는 인계하지 않아요." : "지금까지 한 일과 다음에 할 일을 짧게 적어주세요."} rows={3} /></label>
                <div className="team-form-actions"><p>{teamMessage}</p><button disabled={teamBusy || !teamForm.email.trim()}>{teamBusy ? "저장 중" : sessionRole === "owner" ? (teamForm.note.trim() && teamForm.role === "editor" ? "초대하고 넘기기" : "공유 저장") : "작업 넘기기"}</button></div>
              </form>
            )}

            {sessionRole === "viewer" && <p className="viewer-note">보기 전용 팀원은 작업 기록을 확인할 수 있지만 모델 실행, 도구 승인, 다른 팀원 초대는 할 수 없어요.</p>}

            {teamHandoffs.length > 0 && (
              <section className="handoff-history">
                <h3>최근 인계</h3>
                {teamHandoffs.slice(0, 4).map((handoff) => <p key={handoff.id}><span>{handoff.fromEmail} → {handoff.toEmail}</span><b>{handoff.status === "accepted" ? "이어받음" : "대기 중"}</b></p>)}
              </section>
            )}
          </section>
        </div>
      )}

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

      {projectOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setProjectOpen(false)}>
          <section className="dialog project-dialog" role="dialog" aria-modal="true" aria-label="프로젝트 워크스페이스" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setProjectOpen(false)} aria-label="닫기">×</button>
            <header><p>Terracotta Projects</p><h2>프로젝트별로 기억하고, 파일까지 작업</h2><span>대화·모델 인계·프로젝트 지침·로컬 파일·실행 기록을 한 범위로 묶습니다.</span></header>

            <div className="project-layout">
              <aside className="project-list-panel">
                <button className={!projectEditingId ? "active create" : "create"} type="button" onClick={() => { setProjectEditingId(null); setProjectForm(formForProject(null)); setProjectTab("overview"); }}>＋ 새 프로젝트</button>
                {projects.map((project) => (
                  <button className={projectEditingId === project.id ? "active" : ""} type="button" key={project.id} onClick={() => void loadProjectDetails(project.id)}>
                    <i style={{ background: project.color }} /><span><b>{project.name}</b><small>{project.agentId ? `${project.rootPath} · 로컬 연결` : "대화 전용"}</small></span>
                  </button>
                ))}
              </aside>

              <div className="project-main">
                {projectEditingId && (
                  <div className="project-tabs" role="tablist" aria-label="프로젝트 도구">
                    <button role="tab" aria-selected={projectTab === "overview"} className={projectTab === "overview" ? "active" : ""} onClick={() => setProjectTab("overview")}>개요</button>
                    <button role="tab" aria-selected={projectTab === "files"} className={projectTab === "files" ? "active" : ""} onClick={() => { setProjectTab("files"); void loadProjectFiles(); }}>파일</button>
                    <button role="tab" aria-selected={projectTab === "changes"} className={projectTab === "changes" ? "active" : ""} onClick={() => { setProjectTab("changes"); void loadProjectChanges(); }}>변경 내역</button>
                    <button type="button" className="project-use" onClick={() => void selectProject(projectEditingId)}>이 프로젝트에서 대화</button>
                  </div>
                )}

                {projectTab === "overview" && (
                  <form className="project-form" onSubmit={saveProject}>
                    <div className="project-form-heading"><div><b>{projectEditingId ? "프로젝트 설정" : "새 프로젝트 만들기"}</b><small>연결 범위는 언제든 바꿀 수 있어요.</small></div>{projectEditingId && <button type="button" onClick={() => void archiveProject()}>보관</button>}</div>
                    <label><span>이름</span><input value={projectForm.name} onChange={(event) => setProjectForm((value) => ({ ...value, name: event.target.value }))} placeholder="예: Terracotta 앱" required maxLength={80} /></label>
                    <label><span>설명</span><input value={projectForm.description} onChange={(event) => setProjectForm((value) => ({ ...value, description: event.target.value }))} placeholder="이 프로젝트에서 달성할 목표" maxLength={1200} /></label>
                    <div className="project-form-grid">
                      <label><span>연결 컴퓨터</span><select value={projectForm.agentId} onChange={(event) => setProjectForm((value) => ({ ...value, agentId: event.target.value }))}><option value="">대화만 사용</option>{localAgents.map((agent) => <option value={agent.id} key={agent.id}>{agent.name}{agent.online ? " · 온라인" : " · 오프라인"}</option>)}</select></label>
                      <label><span>프로젝트 폴더</span><input value={projectForm.rootPath} onChange={(event) => setProjectForm((value) => ({ ...value, rootPath: event.target.value }))} placeholder=". 또는 apps/web" /></label>
                      <label><span>기본 모델</span><select value={projectForm.modelPreference} onChange={(event) => setProjectForm((value) => ({ ...value, modelPreference: event.target.value as ModelPreference }))}><option value="latest">최신 모델 자동</option><option value="gpt">GPT 우선</option><option value="claude">Claude 우선</option><option value="gemini">Gemini 우선</option></select></label>
                      <label><span>파일 권한</span><select value={projectForm.fileAccess} onChange={(event) => setProjectForm((value) => ({ ...value, fileAccess: event.target.value as "read-only" | "read-write" }))}><option value="read-write">읽기 + 승인 후 쓰기</option><option value="read-only">읽기 전용</option></select></label>
                      <label><span>터미널 권한</span><select value={projectForm.commandAccess} onChange={(event) => setProjectForm((value) => ({ ...value, commandAccess: event.target.value as "disabled" | "approval" }))}><option value="approval">승인 후 실행</option><option value="disabled">사용 안 함</option></select></label>
                    </div>
                    <label><span>프로젝트 지침</span><textarea value={projectForm.instructions} onChange={(event) => setProjectForm((value) => ({ ...value, instructions: event.target.value }))} placeholder="예: TypeScript를 사용하고, 기존 테스트를 통과시킨 뒤 변경 이유를 요약해줘." rows={5} maxLength={8000} /></label>
                    <div className="project-access-note"><span>✓</span><p><b>폴더 경계를 두 번 확인합니다.</b><small>서버가 프로젝트 상대 경로를 고정하고, 로컬 에이전트가 실제 경로와 심볼릭 링크를 다시 검사합니다. 파일 저장과 명령 실행은 승인 후에만 가능합니다.</small></p></div>
                    <button className="project-save" disabled={projectBusy}>{projectBusy ? "저장 중" : projectEditingId ? "설정 저장" : "프로젝트 만들기"}</button>
                  </form>
                )}

                {projectTab === "files" && projectEditingId && (
                  <section className="project-files">
                    <div className="project-file-toolbar">
                      <form onSubmit={searchProjectFiles}><input value={projectSearchQuery} onChange={(event) => setProjectSearchQuery(event.target.value)} placeholder="프로젝트 안에서 검색" aria-label="프로젝트 파일 검색" /><button disabled={projectBusy}>검색</button></form>
                      <button type="button" onClick={() => void loadProjectFiles()} disabled={projectBusy}>파일 새로고침</button>
                    </div>
                    <div className="project-file-workbench">
                      <aside>
                        <div className="project-new-file"><input value={projectFilePath} onChange={(event) => setProjectFilePath(event.target.value)} placeholder="새 파일 경로" aria-label="새 프로젝트 파일 경로" /><button type="button" onClick={newProjectFile}>새 파일</button></div>
                        {projectSearchResults.length > 0 && <div className="project-search-results"><b>검색 결과</b>{projectSearchResults.map((match, index) => <button type="button" key={`${match.path}-${match.line}-${index}`} onClick={() => void openProjectFile(match.path)}><span>{match.path}{match.line ? `:${match.line}` : ""}</span><small>{match.preview}</small></button>)}</div>}
                        <div className="project-file-tree">{projectFiles.length ? projectFiles.map((file) => file.type === "file" ? <button type="button" className={projectFile?.path === file.path ? "active" : ""} key={file.path} onClick={() => void openProjectFile(file.path)}><span>·</span>{file.path}<small>{file.size < 1024 ? `${file.size} B` : `${Math.round(file.size / 1024)} KB`}</small></button> : <span key={file.path}><i />{file.path}</span>) : <small>온라인 로컬 에이전트를 연결하고 파일 새로고침을 눌러주세요.</small>}</div>
                      </aside>
                      <div className="project-editor">
                        {projectFile ? <><header><div><b>{projectFile.path}</b><small>{projectFile.hash ? `${projectFile.size.toLocaleString()} bytes · SHA ${projectFile.hash.slice(0, 8)}` : "새 파일"}</small></div><button type="button" onClick={() => void saveProjectFile()} disabled={projectBusy || projectForm.fileAccess === "read-only"}>승인하고 저장</button></header><textarea value={projectFileContent} onChange={(event) => setProjectFileContent(event.target.value)} spellCheck={false} aria-label="프로젝트 파일 편집기" /></> : <div className="project-editor-empty"><b>파일을 선택하세요</b><small>모델도 같은 목록·읽기·검색 도구를 사용하고, 저장 전에는 변경 내용을 승인받습니다.</small></div>}
                      </div>
                    </div>
                  </section>
                )}

                {projectTab === "changes" && projectEditingId && (
                  <section className="project-changes">
                    <div className="project-changes-head"><div><b>Git 변경과 Terracotta 활동</b><small>모델·사용자 파일 작업이 프로젝트별로 남습니다.</small></div><button type="button" onClick={() => void loadProjectChanges()} disabled={projectBusy}>새로고침</button></div>
                    <div className="project-git-summary"><b>git status</b><pre>{projectDiff.status || "변경 없음 또는 아직 불러오지 않음"}</pre></div>
                    {(projectDiff.diff || projectDiff.staged) && <details open><summary>Git diff</summary><pre>{[projectDiff.diff, projectDiff.staged && `\n# staged\n${projectDiff.staged}`].filter(Boolean).join("\n")}</pre></details>}
                    <div className="project-activity"><b>최근 활동</b>{projectActivities.length ? projectActivities.map((activity) => <article key={activity.id}><i className={activity.status} /><div><strong>{activity.action}</strong><span>{activity.path ?? "프로젝트"}</span><small>{activity.summary}</small></div><time>{new Date(activity.created_at).toLocaleString("ko-KR")}</time></article>) : <small>아직 기록된 파일 작업이 없어요.</small>}</div>
                  </section>
                )}

                <p className="project-note">{projectNote}</p>
              </div>
            </div>
          </section>
        </div>
      )}

      {localAgentOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setLocalAgentOpen(false)}>
          <section className="dialog local-agent-dialog" role="dialog" aria-modal="true" aria-label="로컬 터미널 연결" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setLocalAgentOpen(false)} aria-label="닫기">×</button>
            <header>
              <p>Terracotta Local Agent</p>
              <h2>내 컴퓨터에서 안전하게 실행</h2>
              <span>Windows PowerShell, macOS zsh, Linux bash를 자동으로 감지합니다.</span>
            </header>

            <div className="local-agent-safety">
              <span>1</span><div><b>명령을 먼저 확인</b><small>모델이 제안한 명령과 작업 경로를 채팅에서 보여줍니다.</small></div>
              <span>2</span><div><b>승인 후에만 실행</b><small>승인하지 않은 명령은 컴퓨터로 전달되지 않습니다.</small></div>
              <span>3</span><div><b>작업 폴더 안에서만</b><small>시스템 명령, 관리자 권한, 폴더 밖 경로를 로컬에서 다시 차단합니다.</small></div>
            </div>

            <div className="local-agent-toolbar">
              <p>{localAgentNote}</p>
              <button type="button" onClick={() => void loadLocalAgents()} disabled={localAgentBusy}>{localAgentBusy ? "확인 중" : "상태 새로고침"}</button>
            </div>

            {localAgents.length > 0 && (
              <div className="local-agent-list">
                {localAgents.map((agent) => (
                  <article key={agent.id}>
                    <i className={agent.online ? "online" : ""} />
                    <div><b>{agent.name}</b><small>{agent.shell ?? "연결 대기"}{agent.workspace ? ` · ${agent.workspace}` : ""}</small></div>
                    <em>{agent.online ? "온라인" : "오프라인"}</em>
                    <button type="button" onClick={() => void revokeLocalAgent(agent.id)} disabled={localAgentBusy}>연결 해제</button>
                  </article>
                ))}
              </div>
            )}

            <section className="local-agent-pair">
              <div className="local-agent-section-head">
                <div><h3>새 컴퓨터 연결</h3><p>Node.js 20 이상이 설치된 터미널에서 두 줄을 실행합니다.</p></div>
                <div className="local-platform-tabs">
                  <button type="button" className={localAgentPlatform === "windows" ? "active" : ""} onClick={() => setLocalAgentPlatform("windows")}>Windows</button>
                  <button type="button" className={localAgentPlatform === "mac" ? "active" : ""} onClick={() => setLocalAgentPlatform("mac")}>macOS / Linux</button>
                </div>
              </div>
              <div className="local-agent-name-row">
                <input value={localAgentName} onChange={(event) => setLocalAgentName(event.target.value)} maxLength={50} placeholder="예: 회사 노트북" aria-label="컴퓨터 이름" />
                <button type="button" onClick={() => void pairLocalAgent()} disabled={localAgentBusy}>연결 키 만들기</button>
              </div>
              {localAgentToken && (
                <div className="local-agent-command">
                  <div><b>{localAgentPlatform === "windows" ? "PowerShell" : "Terminal"}에 붙여넣기</b><small>키는 이 화면에서만 다시 볼 수 있어요.</small></div>
                  <pre><code>{localAgentCommand}</code></pre>
                  <button type="button" onClick={() => void navigator.clipboard.writeText(localAgentCommand)}>명령 복사</button>
                </div>
              )}
            </section>

            {localAgentJobs.length > 0 && (
              <section className="local-agent-history">
                <div className="local-agent-section-head"><div><h3>최근 실행</h3><p>누가 어떤 명령을 승인했는지 결과와 함께 남습니다.</p></div></div>
                {localAgentJobs.slice(0, 6).map((job) => (
                  <details key={job.id}>
                    <summary><code>{job.command}</code><span className={job.status}>{job.status === "completed" ? "완료" : job.status === "running" ? "실행 중" : job.status === "queued" ? "대기" : "확인 필요"}</span></summary>
                    <small>{job.cwd} · exit {job.exitCode ?? "—"}</small>
                    {(job.stdout || job.stderr) && <pre>{job.stdout || job.stderr}</pre>}
                  </details>
                ))}
              </section>
            )}
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

            {visibleModelInsights.length > 0 && (
              <section className="model-compare">
                <div className="model-compare-title"><div><b>{modelInsightFilter === "전체" ? "전체 모델 요약" : `${modelInsightFilter} 추천 모델`}</b><small>강점, 대표 평가, 가격을 먼저 비교한 뒤 아래 상세 설명을 확인하세요.</small></div><span>{visibleModelInsights.length}개 모델</span></div>
                <div className="model-compare-table" role="table" aria-label="모델 핵심 비교">
                  <div className="model-compare-row heading" role="row"><span>모델</span><span>가장 잘하는 일</span><span>대표 평가</span><span>비용</span></div>
                  {visibleModelInsights.map((model) => {
                    const firstArena = arenaMetricOrder.map(({ id, label }) => ({ metric: model.arena[id], label })).find((item) => item.metric);
                    return (
                      <div className="model-compare-row" role="row" key={`compare-${model.id}`}>
                        <span><i>{model.mark}</i><b>{model.name}</b><small>{model.provider}</small></span>
                        <span><b>{model.bestFor[0] ?? model.categories[0] ?? "범용 작업"}</b><small>{model.summary}</small></span>
                        <span><b>{model.intelligenceIndex != null ? `AA ${model.intelligenceIndex}` : firstArena?.metric ? `${firstArena.label} #${firstArena.metric.rank}` : "공식 지표 없음"}</b><small>{model.intelligenceIndex != null && firstArena?.metric ? `${firstArena.label} Arena #${firstArena.metric.rank}` : model.context}</small></span>
                        <span><b>{model.price}</b><small>{model.context}</small></span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

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
            <header><p>Model router · 2026.07</p><h2>Terracotta Auto</h2><span>작업에 맞는 모델을 고르고, GPT·Claude·Gemini의 우선순위는 내가 정합니다.</span></header>

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
              <p className="router-note"><i /> 최신 우선은 GPT와 Claude의 공식 최신 모델을 비교하고 Gemini를 다음 경로로 둡니다. Gemini 우선을 직접 선택할 수도 있어요.</p>
            </section>

            <section className="settings-section" aria-labelledby="models-title">
              <div className="settings-heading"><div><h3 id="models-title">연결 모델</h3><p>하나의 작업 안에서도 필요한 모델만 조합합니다.</p></div><span>5개 공급사 · 6개 핵심 모델</span></div>
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
              <div className="settings-heading"><div><h3 id="pricing-title">구독 출시 가안</h3><p>모든 플랜에서 GPT, Claude, Gemini, Perplexity, Higgsfield를 사용할 수 있어요.</p></div><span>월간 · VAT 별도</span></div>
              <div className="cost-benchmarks">
                <span><b>GPT-5.6 Sol</b><small>$5 입력 · $30 출력 / 1M</small></span>
                <span><b>Claude Fable 5</b><small>$10 입력 · $50 출력 / 1M</small></span>
                <span><b>Claude Sonnet 5</b><small>$2 입력 · $10 출력 / 1M*</small></span>
                <span><b>Gemini 3.6 Flash</b><small>$1.50 입력 · $7.50 출력 / 1M</small></span>
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
              <div className="pricing-sources"><span>공식 가격 확인</span><a href="https://developers.openai.com/api/docs/models" target="_blank" rel="noreferrer">OpenAI</a><a href="https://www.anthropic.com/news/claude-sonnet-5" target="_blank" rel="noreferrer">Anthropic</a><a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Google Gemini</a><a href="https://docs.perplexity.ai/docs/getting-started/pricing" target="_blank" rel="noreferrer">Perplexity</a><a href="https://higgsfield.ai/pricing" target="_blank" rel="noreferrer">Higgsfield</a></div>
            </section>
            <button className="settings-save" onClick={() => setSettingsOpen(false)}>확인</button>
          </section>
        </div>
      )}
    </main>
  );
}
