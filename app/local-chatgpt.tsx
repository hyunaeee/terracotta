"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import styles from "./local-chatgpt.module.css";

type Model = { id: string; name: string };
type Turn = { role: "user" | "assistant"; text: string };
type Session = { connected: boolean; email: string; models: Model[] };
type Pending = "status" | "sign-in" | "sign-out" | null;
const signedOut: Session = { connected: false, email: "", models: [] };
const subscribe = () => () => {};
const localOrigin = () => window.location.protocol === "http:" && window.location.hostname === "127.0.0.1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ConnectionError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function localRequest(action: Exclude<Pending, null> | "chat", signal: AbortSignal, body?: object) {
  if (!localOrigin()) throw new Error("이 컴퓨터에서 실행한 Terracotta로 접속해 주세요.");
  const response = await fetch(`/api/local-chatgpt/${action}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    mode: "same-origin", credentials: "same-origin", redirect: "error", cache: "no-store", signal,
  });
  const payload: unknown = await response.json().catch(() => null);
  const data = isRecord(payload) ? payload : null;
  if (!response.ok) {
    const message = typeof data?.error === "string" && data.error ? data.error : "이 컴퓨터의 ChatGPT 연결 상태를 확인해 주세요.";
    throw new ConnectionError(message, response.status);
  }
  if (!data && action !== "sign-out") throw new Error("로컬 로그인 도우미의 응답을 확인하지 못했습니다.");
  return data ?? {};
}

function errorText(error: unknown) {
  return error instanceof Error && !(error instanceof TypeError) ? error.message : "로컬 연결을 확인한 뒤 다시 시도해 주세요.";
}

export function useLocalChatGPT(enabled: boolean) {
  const onLoopback = useSyncExternalStore(subscribe, localOrigin, () => false);
  const available = enabled && onLoopback;
  const [session, setSession] = useState(signedOut);
  const [ready, setReady] = useState(false);
  const [model, setModel] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending>(null);
  const actionRequest = useRef<AbortController | null>(null);
  const chatRequest = useRef<AbortController | null>(null);

  const updateAccount = useCallback(async (action: Exclude<Pending, null>) => {
    if (!available) return;
    actionRequest.current?.abort();
    const controller = new AbortController();
    actionRequest.current = controller;
    setPending(action);
    setError("");
    try {
      const result = await localRequest(action, controller.signal, action === "status" ? undefined : {});
      controller.signal.throwIfAborted();
      if (action === "sign-in") {
        const url = new URL(String(result.url));
        if (url.origin !== "https://auth.openai.com" || url.pathname !== "/api/accounts/authorize" || url.username || url.password) {
          throw new Error("OpenAI 로그인 주소를 확인하지 못했습니다.");
        }
        window.location.assign(url.href);
        return;
      }
      if (action === "sign-out" || result.connected === false) {
        chatRequest.current?.abort();
        setSession(signedOut);
        setModel("");
      } else {
        if (result.connected !== true) throw new Error("로컬 계정 상태를 확인하지 못했습니다.");
        const models: Model[] = Array.isArray(result.models) ? result.models.filter((item): item is Model =>
          isRecord(item) && typeof item.id === "string" && !!item.id && typeof item.name === "string") : [];
        setSession({ connected: true, email: typeof result.email === "string" ? result.email : "", models });
        setModel((current) => models.some(({ id }) => id === current) ? current : models[0]?.id ?? "");
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(errorText(cause));
    } finally {
      if (!controller.signal.aborted) { setReady(true); setPending(null); }
    }
  }, [available]);

  useEffect(() => {
    if (!available) return;
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      void updateAccount("status");
      if (new URLSearchParams(window.location.hash.slice(1)).has("subscription-error")) {
        setError("ChatGPT 로그인을 완료하지 못했습니다. 다시 연결해 주세요.");
        window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      }
    });
    return () => {
      mounted = false;
      actionRequest.current?.abort();
      chatRequest.current?.abort();
    };
  }, [available, updateAccount]);

  async function ask(turns: readonly Turn[], signal?: AbortSignal) {
    if (!available || pending === "sign-out" || !session.connected || !session.models.some(({ id }) => id === model)) {
      throw new Error("ChatGPT를 연결하고 사용할 모델을 선택해 주세요.");
    }
    if (!turns.length || turns.at(-1)?.role !== "user" || !turns.at(-1)?.text.trim()) throw new Error("질문을 입력해 주세요.");
    if (chatRequest.current) throw new Error("이전 답변을 기다려 주세요.");
    const controller = new AbortController();
    chatRequest.current = controller;
    const requestSignal = signal ? AbortSignal.any([controller.signal, signal]) : controller.signal;
    try {
      const result = await localRequest("chat", requestSignal, { model, turns: turns.map(({ role, text }) => ({ role, text })) });
      requestSignal.throwIfAborted();
      if (typeof result.text !== "string" || !result.text.trim() || typeof result.model !== "string") throw new Error("ChatGPT에서 답변을 받지 못했습니다.");
      return { text: result.text, model: result.model };
    } catch (cause) {
      requestSignal.throwIfAborted();
      if (cause instanceof ConnectionError && cause.status === 401) { setSession(signedOut); setModel(""); }
      throw new Error(errorText(cause));
    } finally {
      chatRequest.current = null;
    }
  }

  return {
    available, ready: available && ready, connected: available && session.connected, email: session.email,
    models: session.models, model, setModel, error, pending, ask,
    refresh: () => updateAccount("status"), signIn: () => updateAccount("sign-in"), signOut: () => updateAccount("sign-out"),
  };
}

export function LocalChatGPTAccount({ account }: { account: ReturnType<typeof useLocalChatGPT> }) {
  if (!account.available) return null;
  const busy = account.pending !== null;
  return (
    <section className={styles.account} aria-label="이 컴퓨터의 ChatGPT 구독">
      <h3>이 컴퓨터의 ChatGPT 구독</h3>
      {account.connected ? (
        <>
          <p>{account.email ? `${account.email} 연결됨` : "ChatGPT 계정이 연결됐어요."}</p>
          {account.models.length > 0 ? <label>사용할 모델
            <select value={account.model} onChange={(event) => account.setModel(event.target.value)} disabled={busy}>
              {account.models.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label> : <p>사용 가능한 모델을 찾지 못했습니다. 계정의 플랜과 사용 한도를 확인해 주세요.</p>}
          <div className={styles.actions}>
            <button type="button" onClick={account.refresh} disabled={busy}>새로고침</button>
            <button type="button" onClick={account.signOut} disabled={busy}>이 컴퓨터에서 로그아웃</button>
          </div>
          <a className={styles.guide} href="https://chatgpt.com/settings/usage" target="_blank" rel="noopener noreferrer">ChatGPT 플랜 사용량 관리 ↗</a>
        </>
      ) : (
        <>
          <p>OpenAI에서 로그인하고 플랜 사용에 동의하면 이 작업실의 ChatGPT 답변이 내 플랜 사용량에 포함됩니다.</p>
          <button className={styles.primary} type="button" onClick={account.signIn} disabled={!account.ready || busy}>
            {!account.ready ? "연결 상태 확인 중…" : account.pending === "sign-in" ? "로그인 여는 중…" : "ChatGPT로 로그인"}
          </button>
        </>
      )}
      {account.error && <p role="alert" className={styles.error}>{account.error}</p>}
    </section>
  );
}
