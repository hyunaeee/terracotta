"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from "react";

const quickPrompts = [
  "오늘 회의 내용을 정리해줘",
  "이번 주에 배운 것을 복습해줘",
  "새 프로젝트 아이디어를 같이 생각해줘",
];

const modelNames = ["Claude", "GPT", "Perplexity", "Higgsfield", "Genspark"];

const gardenShop = [
  { id: "stone", name: "돌길", asset: "/assets/garden/stone.png", cost: 280, unlockAt: 0 },
  { id: "pot", name: "파란 화분", asset: "/assets/garden/pot.png", cost: 420, unlockAt: 0 },
  { id: "flower", name: "노란 들꽃", asset: "/assets/garden/flower.png", cost: 560, unlockAt: 2 },
  { id: "lamp", name: "정원등", asset: "/assets/garden/lamp.png", cost: 760, unlockAt: 4 },
  { id: "fence", name: "나무 울타리", asset: "/assets/garden/fence.png", cost: 880, unlockAt: 6 },
  { id: "mushroom", name: "버섯 무리", asset: "/assets/garden/mushroom.png", cost: 960, unlockAt: 8 },
  { id: "bench", name: "작은 벤치", asset: "/assets/garden/bench.png", cost: 1100, unlockAt: 10 },
  { id: "mailbox", name: "우체통", asset: "/assets/garden/mailbox.png", cost: 1280, unlockAt: 12 },
  { id: "pond", name: "미니 연못", asset: "/assets/garden/pond.png", cost: 1480, unlockAt: 16 },
  { id: "birdbath", name: "새 물그릇", asset: "/assets/garden/birdbath.png", cost: 1680, unlockAt: 20 },
  { id: "picnic", name: "피크닉 매트", asset: "/assets/garden/picnic.png", cost: 1900, unlockAt: 24 },
  { id: "arch", name: "덩굴 아치", asset: "/assets/garden/arch.png", cost: 2200, unlockAt: 30 },
];

const treeStages = ["씨앗", "새싹", "어린 나무", "큰 나무"];
const starterGardenItems = ["stone", "pot", "flower"];

type Message = { role: "user" | "assistant"; text: string; models?: string };

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isWorking, setIsWorking] = useState(false);
  const [sparks, setSparks] = useState(2480);
  const [growth, setGrowth] = useState(0);
  const [gardenItems, setGardenItems] = useState<string[]>(starterGardenItems);
  const [gardenOpen, setGardenOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [ready, setReady] = useState(false);
  const [gardenNote, setGardenNote] = useState("오늘도 천천히 자라고 있어요.");

  useEffect(() => {
    const saved = window.localStorage.getItem("terracotta-garden") ?? window.localStorage.getItem("orbit-simple-garden");
    if (saved) {
      try {
        const data = JSON.parse(saved) as { items?: string[]; sparks?: number; growth?: number };
        if (Array.isArray(data.items)) setGardenItems([...new Set([...starterGardenItems, ...data.items])]);
        if (typeof data.sparks === "number") setSparks(data.sparks);
        if (typeof data.growth === "number") setGrowth(data.growth);
      } catch { /* 새 정원으로 시작합니다. */ }
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem("terracotta-garden", JSON.stringify({ items: gardenItems, sparks, growth }));
  }, [gardenItems, growth, ready, sparks]);

  const selectedTeam = useMemo(() => {
    const text = prompt.toLowerCase();
    if (text.includes("영상") || text.includes("릴스")) return "Claude + Higgsfield";
    if (text.includes("찾") || text.includes("최신") || text.includes("리서치")) return "Perplexity + Claude";
    return "Claude + GPT";
  }, [prompt]);

  const activity = useMemo(
    () => Array.from({ length: 48 }, (_, index) => {
      if (growth > 0 && index >= 48 - Math.min(growth, 6)) return 4;
      return Math.max(0, Math.min(4, ((index * 5 + 9) % 7) - 2));
    }),
    [growth],
  );

  const usageLevel = 12 + growth;
  const treeStage = Math.min(3, Math.floor(usageLevel / 12));
  const nextTreeAt = treeStage === 3 ? null : (treeStage + 1) * 12;
  const placedGardenItems = gardenShop.filter((item) => gardenItems.includes(item.id));

  function submitTask(event: FormEvent) {
    event.preventDefault();
    const task = prompt.trim();
    if (!task || isWorking) return;
    const team = selectedTeam;
    setMessages((items) => [...items, { role: "user", text: task }]);
    setPrompt("");
    setIsWorking(true);
    window.setTimeout(() => {
      setMessages((items) => [...items, {
        role: "assistant",
        text: "좋아요. 필요한 정보를 정리하고, 바로 실행할 수 있는 형태로 준비했어요. 이 작업에서 배운 내용은 테라코타 가든에도 심어둘게요.",
        models: team,
      }]);
      setSparks((value) => value + 36);
      setGrowth((value) => value + 1);
      setGardenNote("방금 끝낸 작업이 새 초록 칸으로 심어졌어요.");
      setIsWorking(false);
    }, 1400);
  }

  function handleComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  function buyItem(id: string, name: string, cost: number, unlockAt: number) {
    if (gardenItems.includes(id)) return;
    if (usageLevel < unlockAt) {
      setGardenNote(`${name}은 사용량 ${unlockAt}부터 잠금 해제돼요.`);
      return;
    }
    if (sparks < cost) {
      setGardenNote(`${name}을 놓으려면 ${cost - sparks} Sparks가 더 필요해요.`);
      return;
    }
    setGardenItems((items) => [...items, id]);
    setSparks((value) => value - cost);
    setGardenNote(`${name}을 정원에 놓았어요.`);
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
            <span className="wordmark-seed" /> Terracotta
          </button>
          <button className="sidebar-close" onClick={() => setMobileMenu(false)} aria-label="메뉴 닫기">×</button>
        </div>

        <button className="new-chat" onClick={newChat}><span>＋</span> 새 대화</button>

        <nav className="sidebar-nav" aria-label="주요 메뉴">
          <button className="active" onClick={() => setMobileMenu(false)}><span>○</span> 대화</button>
          <button onClick={() => { setGardenOpen(true); setMobileMenu(false); }}><span>♧</span> 테라코타 가든</button>
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
            Terracotta Auto <span>⌄</span>
          </button>
          <span className="private-state"><i /> 개인 메모리 켜짐</span>
        </header>

        <div className={`conversation ${messages.length ? "has-messages" : ""}`}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <span className="hello-seed">♧</span>
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
                  {message.role === "assistant" && <span className="assistant-seed">●</span>}
                  <div>
                    <p>{message.text}</p>
                    {message.models && <small>{message.models}로 함께 작업함 · 가든 +1</small>}
                  </div>
                </article>
              ))}
              {isWorking && (
                <article className="message assistant thinking">
                  <span className="assistant-seed">●</span>
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
            {activity.slice(0, 20).map((level, index) => <i key={index} className={`l${level}`} />)}
          </div>
          <div className={`garden-mascot tree-stage-${treeStage}`}><img src="/assets/terracotta-growth.png" alt={`${treeStages[treeStage]} 단계의 테라코타 나무`} /></div>
          {placedGardenItems.map((item) => (
            <img key={item.id} className={`garden-item rail-${item.id}`} src={item.asset} alt="" draggable={false} />
          ))}
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
            <div className="large-garden">
              <div className="large-grid">{activity.map((level, index) => <i key={index} className={`l${level}`} />)}</div>
              <div className={`large-mascot tree-stage-${treeStage}`}><img src="/assets/terracotta-growth.png" alt={`${treeStages[treeStage]} 단계의 테라코타 나무`} /></div>
              {placedGardenItems.map((item) => (
                <img key={item.id} className={`garden-item large-${item.id}`} src={item.asset} alt="" draggable={false} />
              ))}
            </div>
            <div className="garden-meta"><span><b>{treeStages[treeStage]}</b>{nextTreeAt ? `다음 성장까지 ${nextTreeAt - usageLevel}` : "모두 자랐어요"}</span><span><b>{usageLevel}</b> 누적 사용량</span><span><b>{sparks.toLocaleString()}</b> Sparks</span></div>
            <div className="shop-heading">
              <div><h3>가드닝 스토어</h3><p>나무는 살 수 없어요. 사용할수록 스스로 자랍니다.</p></div>
              <span>{gardenShop.filter((item) => usageLevel >= item.unlockAt).length}/{gardenShop.length} 아이템 해금</span>
            </div>
            <div className="simple-shop">
              {gardenShop.map((item) => {
                const owned = gardenItems.includes(item.id);
                const locked = usageLevel < item.unlockAt;
                return (
                  <button key={item.id} className={locked ? "locked" : ""} disabled={owned} onClick={() => buyItem(item.id, item.name, item.cost, item.unlockAt)}>
                    <span className="shop-item-preview"><img src={item.asset} alt="" draggable={false} /></span><b>{item.name}</b><small>{owned ? "배치됨" : locked ? `사용량 ${item.unlockAt}에 해금` : `${item.cost} S`}</small>
                  </button>
                );
              })}
            </div>
            <p className="device-note">정원은 현재 기기에 저장됩니다.</p>
          </section>
        </div>
      )}

      {settingsOpen && (
        <div className="overlay" role="presentation" onMouseDown={() => setSettingsOpen(false)}>
          <section className="dialog settings-dialog" role="dialog" aria-modal="true" aria-label="모델 및 구독" onMouseDown={(event) => event.stopPropagation()}>
            <button className="dialog-close" onClick={() => setSettingsOpen(false)} aria-label="닫기">×</button>
            <header><p>Model router</p><h2>Terracotta Auto</h2><span>작업마다 가장 잘하는 모델을 자동으로 연결합니다.</span></header>
            <div className="simple-models">{modelNames.map((name, index) => <span key={name}><i>{name[0]}</i><b>{name}</b><small>{index < 3 ? "연결됨" : "사용 가능"}</small></span>)}</div>
            <button className="settings-save" onClick={() => setSettingsOpen(false)}>확인</button>
          </section>
        </div>
      )}
    </main>
  );
}
