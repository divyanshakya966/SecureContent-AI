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
    const saved = window.localStorage.getItem("sc-persona") as "simple" | "pro" | null;
    if (saved === "simple" || saved === "pro") setPersona(saved);
  }, [setPersona]);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground"
      >
        Skip to content
      </a>
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col min-w-0">
        <Topbar />
        <main id="main-content" className="grid-backdrop flex-1 overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1400px] px-4 py-5 md:px-6 md:py-6">
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
        <footer className="mt-auto border-t border-border bg-background/80 px-4 py-3 md:px-6">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span className="font-mono">SecureContent AI</span>
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] border rounded-full px-2 py-0.5">
              <span className="font-mono border rounded px-1 py-0.5 bg-muted">⌘K</span> Jump
              <span className="text-border">·</span>
              <span className="font-mono border rounded px-1 py-0.5 bg-muted">?</span> Help
            </span>
            <a href="https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors hidden sm:inline">
              OWASP GenAI Top 10
            </a>
          </div>
        </footer>
      </div>
      <CommandPalette />
      <HelpLegend />
    </div>
  );
}
