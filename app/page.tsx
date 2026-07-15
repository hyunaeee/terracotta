"use client";

import { FormEvent, useMemo, useState } from "react";

const providers = [
  { name: "Claude", role: "깊은 사고", color: "coral", mark: "C" },
  { name: "GPT", role: "정리 · 실행", color: "ink", mark: "G" },
  { name: "Perplexity", role: "실시간 탐색", color: "cyan", mark: "P" },
  { name: "Higgsfield", role: "영상 제작", color: "violet", mark: "H" },
  { name: "Genspark", role: "자료 완성", color: "lime", mark: "S" },
];

const suggestions = [
  "오늘 회의 3줄 요약",
  "신제품 리서치 시작",
  "릴스 영상 콘티 짜줘",
];

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [sparks, setSparks] = useState(2480);
  const [xp, setXp] = useState(68);
  const [isWorking, setIsWorking] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [modal, setModal] = useState<"growth" | "models" | null>(null);

  const selectedModels = useMemo(() => {
    const value = prompt.toLowerCase();
    if (value.includes("영상") || value.includes("릴스")) {
      return [providers[0], providers[3], providers[4]];
    }
    if (value.includes("리서치") || value.includes("최신")) {
      return [providers[2], providers[0], providers[1]];
    }
    return [providers[0], providers[1], providers[2]];
  }, [prompt]);

  function runTask(event: FormEvent) {
    event.preventDefault();
    if (!prompt.trim() || isWorking) return;
    setCompleted(false);
    setIsWorking(true);
    window.setTimeout(() => {
      setIsWorking(false);
      setCompleted(true);
      setSparks((value) => Math.max(0, value - 36));
      setXp((value) => Math.min(100, value + 6));
    }, 1800);
  }

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} aria-label="ORBIT 홈">
          <span className="brand-orb"><i /></span>
          <span>ORBIT</span>
        </button>
        <nav aria-label="주요 메뉴">
          <button className="active" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>작업실</button>
          <button onClick={() => setModal("growth")}>성장 기록</button>
          <button onClick={() => scrollTo("models")}>모델 서재</button>
        </nav>
        <div className="nav-actions">
          <button className="spark-count" onClick={() => setModal("models")}>
            <span className="spark-dot" />
            {sparks.toLocaleString()} sparks
          </button>
          <button className="avatar" aria-label="내 프로필">LK</button>
        </div>
      </header>

      <section className="intro shell">
        <div>
          <p className="kicker"><span>LIVE</span> 나와 함께 자라는 개인 AI</p>
          <h1>생각은 맡겨.<br />나는 자랄게.</h1>
        </div>
        <p className="intro-copy">
          어떤 모델을 써야 할지 고민하지 마세요.<br />
          오르빗이 매 순간 가장 잘하는 AI를 골라 함께 일합니다.
        </p>
      </section>

      <section className="workspace shell" aria-label="AI 작업실">
        <div className="command-card paper-card">
          <div className="card-heading">
            <div>
              <p className="label">NEW MISSION</p>
              <h2>무엇을 해볼까요?</h2>
            </div>
            <div className="online"><span /> 최적 모델 자동 선택</div>
          </div>

          <form onSubmit={runTask} className="prompt-form">
            <textarea
              value={prompt}
              onChange={(event) => { setPrompt(event.target.value); setCompleted(false); }}
              placeholder="자료를 찾고, 생각하고, 만들어야 하는 모든 일을 말해보세요."
              aria-label="AI에게 맡길 일"
            />
            <div className="prompt-tools">
              <div className="tool-buttons" aria-label="작업 도구">
                <button type="button" title="파일 첨부">＋</button>
                <button type="button" title="웹 검색">◎</button>
                <button type="button" title="음성 입력">◉</button>
              </div>
              <button className="submit-button" disabled={!prompt.trim() || isWorking}>
                {isWorking ? "오르빗이 생각 중" : "작업 시작"}
                <span>↗</span>
              </button>
            </div>
          </form>

          <div className="suggestions" aria-label="추천 작업">
            {suggestions.map((suggestion) => (
              <button key={suggestion} onClick={() => { setPrompt(suggestion); setCompleted(false); }}>
                {suggestion}<span>↗</span>
              </button>
            ))}
          </div>

          <div className={`router ${isWorking ? "working" : ""}`}>
            <div className="router-top">
              <p className="label">ORBIT ROUTER</p>
              <span>{isWorking ? "업무를 분해하고 있어요" : completed ? "협업 완료 · 경험치 +6" : "이 작업에 어울리는 팀"}</span>
            </div>
            <div className="route-line">
              {selectedModels.map((provider, index) => (
                <div className="route-node" key={provider.name}>
                  <span className={`provider-mark ${provider.color}`}>{provider.mark}</span>
                  <div><b>{provider.name}</b><small>{provider.role}</small></div>
                  {index < selectedModels.length - 1 && <i />}
                </div>
              ))}
            </div>
          </div>

          {completed && (
            <div className="result-toast" role="status">
              <span>DONE</span>
              <p><b>첫 번째 결과가 준비됐어요.</b> 세 모델의 답을 하나의 실행안으로 합쳤습니다.</p>
              <button onClick={() => setCompleted(false)}>열기 ↗</button>
            </div>
          )}
        </div>

        <aside className="companion-card paper-card">
          <div className="companion-top">
            <div>
              <p className="label">MY ORBIT</p>
              <h2>루미 <span>LV.12</span></h2>
            </div>
            <button className="more" onClick={() => setModal("growth")} aria-label="성장 기록 보기">•••</button>
          </div>

          <button className="mascot-window" onClick={() => setModal("growth")} aria-label="루미 성장 단계 보기">
            <img src="/assets/orbit-evolution.png" alt="전기 라임색 꼬마 AI 루미" />
            <span className="pixel-spark one" />
            <span className="pixel-spark two" />
            <span className="speech">오늘도 하나<br />배웠어!</span>
          </button>

          <div className="level-row">
            <div><span>LEVEL 12</span><b>호기심 많은 코어</b></div>
            <strong>{xp}%</strong>
          </div>
          <div className="progress" aria-label={`다음 레벨까지 ${xp}%`}><i style={{ width: `${xp}%` }} /></div>
          <p className="next-level">다음 진화까지 <b>{100 - xp} sparks</b></p>

          <div className="trait-grid">
            <div><span className="trait-icon lime">✦</span><small>호기심</small><b>+12</b></div>
            <div><span className="trait-icon blue">▦</span><small>기억력</small><b>+8</b></div>
            <div><span className="trait-icon coral">⌁</span><small>센스</small><b>+4</b></div>
          </div>
        </aside>
      </section>

      <section className="memory-strip shell">
        <p><span className="pulse" /> 오늘 루미가 배운 것</p>
        <div className="memory-ticker">
          <span>당신은 긴 보고서보다 <b>3줄 요약</b>을 좋아해요</span>
          <i />
          <span>이미지는 <b>밝고 대담한 톤</b>을 선호해요</span>
          <i />
          <span>오후에는 <b>짧은 실행안</b>부터 보여줄게요</span>
        </div>
      </section>

      <section className="model-library shell" id="models">
        <div className="section-copy">
          <p className="kicker"><span>ONE SUBSCRIPTION</span> 모델은 바뀌어도, 비서는 그대로</p>
          <h2>최고의 두뇌를<br />한 곳에서.</h2>
          <p>각 서비스의 새 모델은 자동으로 들어옵니다. 당신의 기억과 작업 방식은 오르빗에 안전하게 남아요.</p>
          <button onClick={() => setModal("models")}>내 구독 관리 <span>↗</span></button>
        </div>
        <div className="provider-list">
          {providers.map((provider, index) => (
            <div className="provider-row" key={provider.name}>
              <span className={`provider-mark large ${provider.color}`}>{provider.mark}</span>
              <div><b>{provider.name}</b><small>{provider.role}</small></div>
              <span className="status">{index < 3 ? "연결됨" : "사용 가능"}</span>
              <strong>{index < 3 ? "ACTIVE" : "+ ADD"}</strong>
            </div>
          ))}
        </div>
      </section>

      <footer className="shell">
        <div className="brand"><span className="brand-orb"><i /></span><span>ORBIT</span></div>
        <p>나를 이해할수록, 더 나다운 AI.</p>
        <span>Private by design · Seoul, 2026</span>
      </footer>

      {modal && (
        <div className="modal-backdrop" onMouseDown={() => setModal(null)} role="presentation">
          <section className="modal" onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={modal === "growth" ? "성장 기록" : "구독 관리"}>
            <button className="modal-close" onClick={() => setModal(null)} aria-label="닫기">×</button>
            {modal === "growth" ? (
              <>
                <p className="label">EVOLUTION LOG</p>
                <h2>루미가 당신과 함께<br />진화하고 있어요.</h2>
                <div className="evolution-sheet"><img src="/assets/orbit-evolution.png" alt="세포부터 자비스형 두뇌까지 루미의 네 가지 성장 단계" /></div>
                <div className="evolution-steps">
                  <span>01<br /><b>첫 신호</b></span><span className="current">02<br /><b>꼬마 코어</b></span><span>03<br /><b>뉴럴 메이트</b></span><span>04<br /><b>오르빗 마인드</b></span>
                </div>
                <p className="modal-note">작업을 끝내고 취향을 알려줄 때마다 루미의 기억, 판단력, 창의성이 자랍니다.</p>
              </>
            ) : (
              <>
                <p className="label">ONE SUBSCRIPTION</p>
                <h2>필요한 모델만 켜두세요.</h2>
                <p className="modal-note left">오르빗이 작업마다 가장 적합한 조합을 고릅니다. 실제 연동과 결제는 다음 제품 단계에서 연결할 수 있어요.</p>
                <div className="modal-models">
                  {providers.map((provider, index) => (
                    <label key={provider.name}>
                      <span className={`provider-mark ${provider.color}`}>{provider.mark}</span>
                      <span><b>{provider.name}</b><small>{provider.role}</small></span>
                      <input type="checkbox" defaultChecked={index < 3} />
                      <i />
                    </label>
                  ))}
                </div>
                <button className="modal-primary" onClick={() => setModal(null)}>변경사항 저장</button>
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
