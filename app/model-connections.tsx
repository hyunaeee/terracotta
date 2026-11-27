"use client";

import type { ReactNode } from "react";
import { WorkspaceDialog } from "./workspace-dialog";
import styles from "./model-connections.module.css";

export type SubscriptionProvider = "chatgpt" | "claude";

export const subscriptionServices = {
  chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
  claude: { name: "Claude", url: "https://claude.ai/new" },
} as const;

type ModelConnectionsProps = {
  provider: SubscriptionProvider;
  onSelect: (provider: SubscriptionProvider) => void;
  onDismiss: () => void;
  children?: ReactNode;
};

export function ModelConnections({ provider, onSelect, onDismiss, children }: ModelConnectionsProps) {
  const selectedService = subscriptionServices[provider];
  return (
    <WorkspaceDialog label="구독 서비스 선택" panelClass={styles.panel} onDismiss={onDismiss}>
      <button className="dialog-close" onClick={onDismiss} aria-label="구독 서비스 선택 닫기">×</button>
      <h2>구독 서비스 선택</h2>
      <p>웹에서는 기존 구독 계정으로 로그인하고 답변도 해당 사이트에서 확인합니다. ChatGPT는 이 PC의 로컬 작업실에서도 연결할 수 있어요.</p>
      <fieldset className={styles.options}>
        <legend>질문을 보낼 서비스</legend>
        {(["chatgpt", "claude"] as const).map((id) => (
          <label key={id} className={styles.option}>
            <input type="radio" name="subscription-service" value={id} checked={provider === id}
              onChange={() => onSelect(id)} />
            <span>{subscriptionServices[id].name}</span>
          </label>
        ))}
      </fieldset>
      {children}
      <details className="local-plan-help">
        <summary>{selectedService.name}에 연결한 Higgsfield 쓰기</summary>
        <p>{provider === "chatgpt" ? "공식 ChatGPT 대화에서 Higgsfield 플러그인을 선택하고 질문을 보내세요." : "Claude 대화의 커넥터 메뉴에서 Higgsfield를 켜고 질문을 보내세요."} 생성에는 연결한 Higgsfield 계정의 크레딧을 사용합니다.</p>
        <a href="https://higgsfield.ai/mcp" target="_blank" rel="noopener noreferrer">Higgsfield 공식 연결 안내 ↗</a>
      </details>
      <div className={styles.actions}>
        <a href={selectedService.url} target="_blank" rel="noopener noreferrer">
          {selectedService.name} 공식 사이트 열기 <span aria-hidden="true">↗</span><span className={styles.srOnly}> (새 창)</span>
        </a>
        <button type="button" onClick={onDismiss}>완료</button>
      </div>
    </WorkspaceDialog>
  );
}
