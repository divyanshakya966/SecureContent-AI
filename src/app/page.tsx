"use client";

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
import { useApp } from "@/lib/store";

export default function Home() {
  const { view } = useApp();

  return (
    <div className="flex min-h-screen w-full bg-background">
      <Sidebar />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="grid-backdrop flex-1 overflow-x-hidden">
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
          <div className="mx-auto flex max-w-[1400px] flex-col items-center justify-between gap-2 text-[11px] text-muted-foreground sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="font-mono">Secure Intelligence</span>
              <span className="text-border">·</span>
              <span>Policy-Aware · Intelligence-Aware · Zero-Trust</span>
            </div>
            <div className="flex items-center gap-3">
              <span>SIH26154 · SecureContent AI</span>
              <span className="text-border">·</span>
              <a href="https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/" target="_blank" rel="noreferrer" className="hover:text-foreground transition-colors">
                OWASP GenAI LLM Top 10 (2026)
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
