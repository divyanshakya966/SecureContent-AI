"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, UploadCloud, HelpCircle, Search } from "lucide-react";
import { useApp, type ViewKey } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/secure/mobile-nav";

const TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "Risk, protection status, and recent activity" },
  upload: { title: "Ingest", subtitle: "Upload or paste content" },
  documents: { title: "Documents", subtitle: "Inventory and risk" },
  document: { title: "Document", subtitle: "Findings and transformations" },
  intelligence: { title: "Intelligence", subtitle: "Entities, IOCs, TTPs, risks" },
  "policy-compare": { title: "Policy Lab", subtitle: "Compare sanitized outputs" },
  policies: { title: "Policies", subtitle: "Allow / mask / remove / block" },
  audit: { title: "Audit", subtitle: "Trail of decisions" },
  architecture: { title: "Architecture", subtitle: "Pipeline and controls" },
};

export function Topbar() {
  const { view, setView, setHelpOpen, setCommandOpen } = useApp();
  const { theme, setTheme } = useTheme();
  const meta = TITLES[view];

  return (
    <header className="sticky top-0 z-30 flex h-[64px] items-center gap-2 sm:gap-3 border-b border-border bg-background/85 px-3 sm:px-4 backdrop-blur-md md:px-6">
      <MobileNav />

      <div className="min-w-0 flex-1">
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
          <span className="font-mono text-primary">SC</span>
          <span className="text-border">/</span>
          <span>SecureContent</span>
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="truncate text-base font-semibold tracking-tight md:text-lg">{meta.title}</h1>
        </div>
        <p className="truncate text-xs text-muted-foreground hidden sm:block">{meta.subtitle}</p>
      </div>

      {/* Quick search button (secondary quick access) */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setCommandOpen(true)}
        className="hidden md:inline-flex h-9 gap-1.5 text-muted-foreground"
        aria-label="Quick jump"
      >
        <Search className="h-3.5 w-3.5" />
        <span className="hidden xl:inline">Jump</span>
        <span className="hidden xl:inline-flex font-mono text-[10px] border rounded px-1 py-0.5 bg-muted">⌘K</span>
      </Button>

      <Button
        variant="ghost"
        size="icon"
        onClick={() => setHelpOpen(true)}
        aria-label="Help & legend"
        className="h-9 w-9"
      >
        <HelpCircle className="h-4 w-4" />
      </Button>

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

      <Button onClick={() => setView("upload")} size="sm" className="h-9 gap-1.5 shrink-0">
        <UploadCloud className="h-4 w-4" />
        <span className="hidden sm:inline">Ingest</span>
      </Button>
    </header>
  );
}
