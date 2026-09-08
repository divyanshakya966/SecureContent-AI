"use client";

import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "upload"
  | "documents"
  | "document"
  | "policies"
  | "audit"
  | "architecture";

interface AppState {
  view: ViewKey;
  selectedDocumentId: string | null;
  // A monotonically increasing refresh key. Increment to invalidate lists.
  refreshKey: number;
  setView: (v: ViewKey) => void;
  openDocument: (id: string) => void;
  bumpRefresh: () => void;
}

export const useApp = create<AppState>((set) => ({
  view: "dashboard",
  selectedDocumentId: null,
  refreshKey: 0,
  setView: (v) => set({ view: v }),
  openDocument: (id) => set({ view: "document", selectedDocumentId: id }),
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
}));
