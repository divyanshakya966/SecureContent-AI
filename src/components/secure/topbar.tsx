"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, UploadCloud } from "lucide-react";
import { useApp, type ViewKey } from "@/lib/store";
import { Button } from "@/components/ui/button";

const TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Operations Console", subtitle: "Secure Intelligence · Policy-aware, intelligence-aware, zero-trust" },
  upload: { title: "Ingest Content", subtitle: "Upload documents, paste text, or load an attack sample" },
  documents: { title: "Documents", subtitle: "Every ingested source, its risk score and intelligence" },
  document: { title: "Document Analysis", subtitle: "Findings, intelligence, sanitization, transformation & release gate" },
  intelligence: { title: "Intelligence", subtitle: "Entities, IOCs, TTPs (MITRE ATT&CK), risks, key findings & evidence" },
  "policy-compare": { title: "Policy Compare", subtitle: "Same source, different audiences — compare sanitized outputs" },
  policies: { title: "Transformation Policies", subtitle: "Audience-specific allow / mask / remove / block buckets" },
  audit: { title: "Audit Trail", subtitle: "Every security decision, timestamped and attributable" },
  architecture: { title: "Architecture & Threat Model", subtitle: "How the zero-trust pipeline is structured" },
};

export function Topbar() {
  const { view, setView } = useApp();
  const { theme, setTheme } = useTheme();
  const meta = TITLES[view];

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur-md md:px-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span className="font-mono text-primary">SIH26154</span>
          <span className="text-border">/</span>
          <span>Secure Intelligence</span>
          <span className="hidden sm:inline text-border">/</span>
          <span className="hidden sm:inline">Policy-Aware · Intelligence-Aware · Zero-Trust</span>
        </div>
        <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{meta.title}</h1>
        <p className="truncate text-xs text-muted-foreground">{meta.subtitle}</p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        className="h-9 w-9"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </Button>

      <Button onClick={() => setView("upload")} size="sm" className="h-9 gap-1.5">
        <UploadCloud className="h-4 w-4" />
        <span className="hidden sm:inline">Ingest</span>
      </Button>
    </header>
  );
}
