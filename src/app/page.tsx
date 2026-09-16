"use client";

import { useEffect } from "react";
import { Sidebar } from "@/components/secure/sidebar";
import { Topbar } from "@/components/secure/topbar";
import { DashboardView } from "@/components/secure/dashboard-view";
import { UploadView } from "@/components/secure/upload-view";
import { DocumentsView } from "@/components/secure/documents-view";
import { DocumentDetailView } from "@/components/secure/document-detail-view";
import { PoliciesView } from "@/components/secure/policies-view";
import { IntelligenceView } from "@/components/secure/intelligence-view";
import { PolicyCompareView } from "@/components/secure/policy-compare-view";
import { AuditView } from "@/components/secure/audit-view";
import { ArchitectureView } from "@/components/secure/architecture-view";
import { CommandPalette } from "@/components/secure/command-palette";
import { HelpLegend } from "@/components/secure/help-legend";
import { useApp } from "@/lib/store";

export default function Home() {
  const { view, setPersona } = useApp();

  // Hydrate persona from localStorage without hydration mismatch
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("sc-persona") as "simple" | "pro" | null;
      if (saved === "simple" || saved === "pro") setPersona(saved);
    } catch {
      // ignore storage access errors (privacy mode / quota)
    }
  }, [setPersona]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground shadow-lg"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0 bg-background">
        <Topbar />
        <main id="main-content" className="flex-1 overflow-x-hidden bg-muted/40 dark:bg-muted/20">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-6 md:px-6 md:py-6">
            {view === "dashboard" && <DashboardView />}
            {view === "upload" && <UploadView />}
            {view === "documents" && <DocumentsView />}
            {view === "document" && <DocumentDetailView />}
            {view === "intelligence" && <IntelligenceView />}
            {view === "policy-compare" && <PolicyCompareView />}
            {view === "policies" && <PoliciesView />}
            {view === "audit" && <AuditView />}
            {view === "architecture" && <ArchitectureView />}
          </div>
        </main>
        <footer className="border-t border-border bg-card px-4 py-3 md:px-6">
          <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-3 text-[11px] leading-none">
            <div className="flex items-center gap-3">
              <span className="font-mono font-medium">SecureContent AI</span>
              <span className="hidden sm:inline h-3 w-px bg-border" />
              <span className="hidden sm:inline text-muted-foreground">© {new Date().getFullYear()} · Policy-aware content security platform</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border bg-muted/50 px-2.5 py-1 text-[11px] font-medium">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Pipeline operational
              </span>
              <a href="https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/" target="_blank" rel="noreferrer" className="hidden lg:inline hover:text-foreground transition-colors underline-offset-4 hover:underline">
                OWASP GenAI Top 10
              </a>
            </div>
          </div>
        </footer>
      </div>
      <CommandPalette />
      <HelpLegend />
    </div>
  );
}
