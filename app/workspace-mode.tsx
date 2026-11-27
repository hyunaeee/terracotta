"use client";

import { createContext, useContext, type ReactNode } from "react";

type Mode = "owner" | "personal-owner" | "browser" | "local";
const Workspace = createContext<Mode>("owner");

export function WorkspaceMode({ mode, children }: { mode: Mode; children: ReactNode }) {
  return <Workspace.Provider value={mode}>{children}</Workspace.Provider>;
}

export function useWorkspaceMode() {
  return useContext(Workspace);
}
