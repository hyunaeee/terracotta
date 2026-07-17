"use client";

import { DragEvent, FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

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

const gardenShop = [
  { id: "grass", name: "잔디 한 칸", asset: "/assets/garden/grass.png", cost: 90, unlockAt: 0, repeatable: true, defaultCell: 0 },
  { id: "stone", name: "돌길", asset: "/assets/garden/stone.png", cost: 280, unlockAt: 0, repeatable: false, defaultCell: 15 },
  { id: "pot", name: "파란 화분", asset: "/assets/garden/pot.png", cost: 420, unlockAt: 0, repeatable: false, defaultCell: 4 },
  { id: "flower", name: "노란 들꽃", asset: "/assets/garden/flower.png", cost: 560, unlockAt: 2, repeatable: false, defaultCell: 19 },
  { id: "lamp", name: "정원등", asset: "/assets/garden/lamp.png", cost: 760, unlockAt: 4, repeatable: false, defaultCell: 5 },
  { id: "fence", name: "나무 울타리", asset: "/assets/garden/fence.png", cost: 880, unlockAt: 6, repeatable: false, defaultCell: 9 },
  { id: "mushroom", name: "버섯 무리", asset: "/assets/garden/mushroom.png", cost: 960, unlockAt: 8, repeatable: false, defaultCell: 1 },
  { id: "bench", name: "작은 벤치", asset: "/assets/garden/bench.png", cost: 1100, unlockAt: 10, repeatable: false, defaultCell: 16 },
  { id: "mailbox", name: "우체통", asset: "/assets/garden/mailbox.png", cost: 1280, unlockAt: 12, repeatable: false, defaultCell: 3 },
  { id: "pond", name: "미니 연못", asset: "/assets/garden/pond.png", cost: 1480, unlockAt: 16, repeatable: false, defaultCell: 18 },
  { id: "birdbath", name: "새 물그릇", asset: "/assets/garden/birdbath.png", cost: 1680, unlockAt: 20, repeatable: false, defaultCell: 10 },
  { id: "picnic", name: "피크닉 매트", asset: "/assets/garden/picnic.png", cost: 1900, unlockAt: 24, repeatable: false, defaultCell: 17 },
  { id: "arch", name: "덩굴 아치", asset: "/assets/garden/arch.png", cost: 2200, unlockAt: 30, repeatable: false, defaultCell: 2 },
];

const treeStages = ["씨앗", "새싹", "어린 나무", "큰 나무"];
const treeAssets = treeStages.map((_, index) => `/assets/terracotta-stage-${index}.png`);

type Message = { role: "user" | "assistant"; text: string; models?: string };
type GardenPlacement = { instanceId: string; itemId: string; cell: number };
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
  last_checked_at: string | null;
  error: string | null;
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

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [sparks, setSparks] = useState(2480);
  const [growth, setGrowth] = useState(0);
  const [ownedItems, setOwnedItems] = useState<string[]>([]);
  const [placements, setPlacements] = useState<GardenPlacement[]>([]);
  const [draggedPlacement, setDraggedPlacement] = useState<string | null>(null);
  const [selectedPlacement, setSelectedPlacement] = useState<string | null>(null);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpConnections, setMcpConnections] = useState<McpConnection[]>([]);
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpBusy, setMcpBusy] = useState<string | null>(null);
  const [mcpNote, setMcpNote] = useState("공식 서버를 연결하면 테라코타가 필요한 도구를 발견해 사용할 수 있어요.");
  const [customMcp, setCustomMcp] = useState({ name: "", url: "" });
  const [modelPreference, setModelPreference] = useState<ModelPreference>("latest");
  const [registryStatus, setRegistryStatus] = useState<RegistryStatus | null>(null);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [gardenNote, setGardenNote] = useState("정원은 아직 비어 있어요. 스토어에서 첫 잔디를 심어보세요.");

  /* eslint-disable react-hooks/set-state-in-effect -- browser-persisted owner preferences hydrate once after mount */
  useEffect(() => {
    const savedPreference = window.localStorage.getItem("terracotta-model-preference");
    if (savedPreference === "latest" || savedPreference === "gpt" || savedPreference === "claude") {
      setModelPreference(savedPreference);
    }
    const saved = window.localStorage.getItem("terracotta-garden-v2");
    const legacy = window.localStorage.getItem("terracotta-garden") ?? window.localStorage.getItem("orbit-simple-garden");
    if (saved) {
      try {
        const data = JSON.parse(saved) as { ownedItems?: string[]; placements?: GardenPlacement[]; sparks?: number; growth?: number };
        if (Array.isArray(data.ownedItems)) setOwnedItems(data.ownedItems);
        if (Array.isArray(data.placements)) setPlacements(data.placements.filter((item) => item.cell >= 0 && item.cell < 20));
        if (typeof data.sparks === "number") setSparks(data.sparks);
        if (typeof data.growth === "number") setGrowth(data.growth);
      } catch { /* 새 정원으로 시작합니다. */ }
    } else if (legacy) {
      try {
        const data = JSON.parse(legacy) as { sparks?: number; growth?: number };
        if (typeof data.sparks === "number") setSparks(data.sparks);
        if (typeof data.growth === "number") setGrowth(data.growth);
      } catch { /* 사용량만 새 정원으로 옮깁니다. */ }
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
    window.localStorage.setItem("terracotta-garden-v2", JSON.stringify({ ownedItems, placements, sparks, growth }));
  }, [growth, ownedItems, placements, ready, sparks]);

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
  const grassCells = useMemo(() => new Set(placements.filter((item) => item.itemId === "grass").map((item) => item.cell)), [placements]);
  const grassCount = grassCells.size;

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

  function nextOpenCell(itemId: string, preferredCell: number) {
    const occupied = new Set(placements.filter((item) => itemId === "grass" ? item.itemId === "grass" : item.itemId !== "grass").map((item) => item.cell));
    if (!occupied.has(preferredCell)) return preferredCell;
    return Array.from({ length: 20 }, (_, index) => index).find((cell) => !occupied.has(cell)) ?? null;
  }

  function buyItem(item: (typeof gardenShop)[number]) {
    if (!item.repeatable && ownedItems.includes(item.id)) return;
    if (item.id === "grass" && grassCount >= 20) {
      setGardenNote("20칸에 잔디를 모두 심었어요. 잔디를 드래그해 자리를 바꿀 수 있어요.");
      return;
    }
    if (usageLevel < item.unlockAt) {
      setGardenNote(`${item.name}은 사용량 ${item.unlockAt}부터 잠금 해제돼요.`);
      return;
    }
    if (sparks < item.cost) {
      setGardenNote(`${item.name}을 놓으려면 ${item.cost - sparks} Sparks가 더 필요해요.`);
      return;
    }

    const cell = nextOpenCell(item.id, item.defaultCell);
    if (cell === null) {
      setGardenNote("비어 있는 칸이 없어요. 아이템을 옮긴 뒤 다시 놓아보세요.");
      return;
    }

    const instanceId = item.repeatable ? `grass-${Date.now()}-${placements.length}` : item.id;
    if (!item.repeatable) setOwnedItems((items) => [...items, item.id]);
    setPlacements((items) => [...items, { instanceId, itemId: item.id, cell }]);
    setSparks((value) => value - item.cost);
    setGardenNote(`${item.name}을 놓았어요. 마우스로 원하는 칸에 옮겨보세요.`);
  }

  function movePlacement(instanceId: string, targetCell: number) {
    setPlacements((items) => {
      const moving = items.find((item) => item.instanceId === instanceId);
      if (!moving || moving.cell === targetCell) return items;

      if (moving.itemId === "grass") {
        const occupying = items.find((item) => item.itemId === "grass" && item.cell === targetCell);
        return items.map((item) => {
          if (item.instanceId === moving.instanceId) return { ...item, cell: targetCell };
          if (occupying && item.instanceId === occupying.instanceId) return { ...item, cell: moving.cell };
          return item;
        });
      }

      return items.map((item) => item.instanceId === instanceId ? { ...item, cell: targetCell } : item);
    });
    setSelectedPlacement(null);
    setDraggedPlacement(null);
    setGardenNote("새 위치를 저장했어요.");
  }

  function handleDragStart(event: DragEvent<HTMLButtonElement>, instanceId: string) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", instanceId);
    setDraggedPlacement(instanceId);
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, cell: number) {
    event.preventDefault();
    const instanceId = event.dataTransfer.getData("text/plain") || draggedPlacement;
    if (instanceId) movePlacement(instanceId, cell);
  }

  function gridPosition(cell: number) {
    return { gridColumn: (cell % 5) + 1, gridRow: Math.floor(cell / 5) + 1 };
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
          <div><b>테라코타 가든</b><span><i /> {treeStages[treeStage]} · 사용량 {usageLevel}</span></div>
          <button onClick={() => setGardenOpen(true)} aria-label="가든 크게 보기">↗</button>
        </div>
        <button className="pixel-garden" onClick={() => setGardenOpen(true)} aria-label="가든 열기">
          <div className="garden-grid">
            {Array.from({ length: 20 }, (_, index) => <i key={index} className={grassCells.has(index) ? "has-grass" : ""} />)}
            {placements.filter((placement) => placement.itemId !== "grass").map((placement) => {
              const item = gardenShop.find((entry) => entry.id === placement.itemId);
              return item ? <img key={placement.instanceId} className="mini-garden-item" style={gridPosition(placement.cell)} src={item.asset} alt="" draggable={false} /> : null;
            })}
          </div>
          <div className="garden-mascot"><img src={treeAssets[treeStage]} alt={`${treeStages[treeStage]} 단계의 테라코타 캐릭터`} /></div>
        </button>
        <div className="garden-rail-foot">
          <span>지식 {128 + growth}개</span>
          <button onClick={() => setGardenOpen(true)}>가꾸기</button>
        </div>
      </aside>

      {gardenOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setGardenOpen(false)}>
          <section className="dialog garden-dialog" role="dialog" aria-modal="true" aria-label="테라코타 가든" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setGardenOpen(false)} aria-label="닫기">×</button>
            <header><p>Terracotta Garden</p><h2>내 지식 정원</h2><span>{gardenNote}</span></header>
            <p className="drag-help">아이템을 마우스로 끌어 원하는 칸에 놓으세요. 클릭한 뒤 빈 칸을 눌러도 이동합니다.</p>
            <div className="large-garden">
              {Array.from({ length: 20 }, (_, index) => {
                const grassPlacement = placements.find((placement) => placement.itemId === "grass" && placement.cell === index);
                const selected = grassPlacement?.instanceId === selectedPlacement;
                return (
                  <button
                    type="button"
                    key={index}
                    className={`garden-cell ${grassPlacement ? "has-grass" : ""} ${selected ? "selected" : ""}`}
                    draggable={Boolean(grassPlacement)}
                    onDragStart={(event) => grassPlacement && handleDragStart(event, grassPlacement.instanceId)}
                    onDragEnd={() => setDraggedPlacement(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, index)}
                    onClick={() => {
                      if (selectedPlacement) movePlacement(selectedPlacement, index);
                      else if (grassPlacement) setSelectedPlacement(grassPlacement.instanceId);
                    }}
                    aria-label={`${Math.floor(index / 5) + 1}행 ${(index % 5) + 1}열${grassPlacement ? " 잔디" : " 빈 흙"}`}
                  />
                );
              })}
              <div className="large-mascot"><img src={treeAssets[treeStage]} alt={`${treeStages[treeStage]} 단계의 테라코타 캐릭터`} /></div>
              {placements.filter((placement) => placement.itemId !== "grass").map((placement) => {
                const item = gardenShop.find((entry) => entry.id === placement.itemId);
                if (!item) return null;
                return (
                  <button
                    type="button"
                    key={placement.instanceId}
                    className={`movable-garden-item ${selectedPlacement === placement.instanceId ? "selected" : ""}`}
                    style={gridPosition(placement.cell)}
                    draggable
                    onDragStart={(event) => handleDragStart(event, placement.instanceId)}
                    onDragEnd={() => setDraggedPlacement(null)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => handleDrop(event, placement.cell)}
                    onClick={() => setSelectedPlacement(placement.instanceId)}
                    aria-label={`${item.name} 위치 옮기기`}
                  >
                    <img src={item.asset} alt="" draggable={false} />
                  </button>
                );
              })}
            </div>
            <div className="garden-meta"><span><b>{treeStages[treeStage]}</b>{nextTreeAt ? `다음 성장까지 ${nextTreeAt - usageLevel}` : "모두 자랐어요"}</span><span><b>{usageLevel}</b> 누적 사용량</span><span><b>{sparks.toLocaleString()}</b> Sparks</span></div>
            <div className="shop-heading">
              <div><h3>가드닝 스토어</h3><p>나무는 살 수 없어요. 사용할수록 스스로 자랍니다.</p></div>
              <span>{gardenShop.filter((item) => usageLevel >= item.unlockAt).length}/{gardenShop.length} 아이템 해금</span>
            </div>
            <div className="simple-shop">
              {gardenShop.map((item) => {
                const owned = !item.repeatable && ownedItems.includes(item.id);
                const locked = usageLevel < item.unlockAt;
                const soldOut = item.id === "grass" && grassCount >= 20;
                return (
                  <button key={item.id} className={locked ? "locked" : ""} disabled={owned || soldOut} onClick={() => buyItem(item)}>
                    <span className="shop-item-preview"><img src={item.asset} alt="" draggable={false} /></span><b>{item.name}</b><small>{owned ? "배치됨" : soldOut ? "20칸 모두 심음" : locked ? `사용량 ${item.unlockAt}에 해금` : item.id === "grass" ? `${grassCount}/20 · ${item.cost} S` : `${item.cost} S`}</small>
                  </button>
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
              <button onClick={() => void loadMcp()} disabled={mcpLoading}>{mcpLoading ? "확인 중" : "새로고침"}</button>
            </div>

            <p className="mcp-note">{mcpNote}</p>

            <div className="mcp-grid" aria-live="polite">
              {mcpLoading && mcpConnections.length === 0 ? <p className="mcp-empty">연결 목록을 불러오고 있어요.</p> : mcpConnections.map((item) => {
                const connected = item.status === "connected";
                const authorizing = item.status === "authorizing";
                const failed = item.status === "error";
                return (
                  <article className={`mcp-card ${connected ? "connected" : ""}`} key={item.id}>
                    <div className="mcp-card-top">
                      <span className={`mcp-service-mark service-${item.id.split("-")[0]}`}>{item.name.slice(0, 1).toUpperCase()}</span>
                      <div><b>{item.name}</b><small>{item.category} · {item.note}</small></div>
                      <em className={connected ? "connected" : failed ? "failed" : ""}>{connected ? `${item.tool_count}개 도구` : authorizing ? "승인 중" : failed ? "확인 필요" : "연결 안 됨"}</em>
                    </div>
                    {connected && item.tools.length > 0 && (
                      <div className="mcp-tools">{item.tools.slice(0, 4).map((tool, index) => <span key={`${tool.name ?? "tool"}-${index}`}>{tool.name ?? "tool"}</span>)}{item.tools.length > 4 && <span>+{item.tools.length - 4}</span>}</div>
                    )}
                    {item.error && !connected && <p className="mcp-error">{item.error}</p>}
                    <div className="mcp-card-actions">
                      <button className="mcp-connect" disabled={mcpBusy === item.id} onClick={() => void connectMcp(item.id)}>{mcpBusy === item.id ? "확인 중" : connected ? "다시 연결" : "연결"}</button>
                      {(connected || item.id.startsWith("custom-")) && <button className="mcp-disconnect" disabled={mcpBusy === item.id} onClick={() => void disconnectMcp(item.id)}>{item.id.startsWith("custom-") ? "삭제" : "연결 해제"}</button>}
                    </div>
                  </article>
                );
              })}
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

      {settingsOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="모델 및 구독" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setSettingsOpen(false)} aria-label="닫기">×</button>
            <header><p>Model router · 2026.07</p><h2>Terracotta Auto</h2><span>작업에 맞는 모델을 고르고, GPT와 Claude의 우선순위는 내가 정합니다.</span></header>

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
