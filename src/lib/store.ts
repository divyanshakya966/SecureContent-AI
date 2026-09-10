"use client";

import { create } from "zustand";

export type ViewKey =
  | "dashboard"
  | "upload"
  | "documents"
  | "document"
  | "policies"
  | "intelligence"
  | "policy-compare"
  | "audit"
  | "architecture";

export type Persona = "simple" | "pro";

interface AppState {
  view: ViewKey;
  selectedDocumentId: string | null;
  // A monotonically increasing refresh key. Increment to invalidate lists.
  refreshKey: number;
  // UX state
  persona: Persona;
  commandOpen: boolean;
  helpOpen: boolean;
  setView: (v: ViewKey) => void;
  openDocument: (id: string) => void;
  bumpRefresh: () => void;
  setPersona: (p: Persona) => void;
  setCommandOpen: (o: boolean) => void;
  setHelpOpen: (o: boolean) => void;
}

export const useApp = create<AppState>((set) => ({
  view: "dashboard",
  selectedDocumentId: null,
  refreshKey: 0,
  persona: "simple" as Persona,
  commandOpen: false,
  helpOpen: false,
  setView: (v) => set({ view: v }),
  openDocument: (id) => set({ view: "document", selectedDocumentId: id }),
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  setPersona: (p) => {
    if (typeof window !== "undefined") window.localStorage.setItem("sc-persona", p);
    set({ persona: p });
  },
  setCommandOpen: (o) => set({ commandOpen: o }),
  setHelpOpen: (o) => set({ helpOpen: o }),
}));
