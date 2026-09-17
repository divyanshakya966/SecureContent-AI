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
  refreshKey: number;
  persona: Persona;
  commandOpen: boolean;
  helpOpen: boolean;
  bumpRefresh: () => void;
  setPersona: (p: Persona) => void;
  setCommandOpen: (o: boolean) => void;
  setHelpOpen: (o: boolean) => void;
}

export const useApp = create<AppState>((set) => ({
  refreshKey: 0,
  persona: "simple" as Persona,
  commandOpen: false,
  helpOpen: false,
  bumpRefresh: () => set((s) => ({ refreshKey: s.refreshKey + 1 })),
  setPersona: (p) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem("sc-persona", p);
      } catch {
        // ignore quota / privacy mode
      }
    }
    set({ persona: p });
  },
  setCommandOpen: (o) => set({ commandOpen: o }),
  setHelpOpen: (o) => set({ helpOpen: o }),
}));
