"use client";

import { useTheme } from "next-themes";
import { Moon, Sun, UploadCloud, Search, ChevronRight } from "lucide-react";
import { useApp, type ViewKey } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/secure/mobile-nav";

const TITLES: Record<ViewKey, { title: string; subtitle: string }> = {
  dashboard: { title: "Overview", subtitle: "Risk, protection status, and recent activity" },
  upload: { title: "Ingest", subtitle: "Upload or paste content for scanning" },
  documents: { title: "Documents", subtitle: "Inventory and risk posture" },
  document: { title: "Document", subtitle: "Findings, sanitization, and output" },
  intelligence: { title: "Intelligence", subtitle: "Entities · IOCs · TTPs · Risks" },
  "policy-compare": { title: "Policy Lab", subtitle: "Audience-specific sanitization preview" },
  policies: { title: "Policies", subtitle: "Allow · Mask · Remove · Block" },
  audit: { title: "Audit", subtitle: "Immutable trail of decisions" },
  architecture: { title: "Architecture", subtitle: "Pipeline, threat model, and controls" },
};

export function Topbar() {
  const { view, setView } = useApp();
  const { theme, setTheme } = useTheme();
  const meta = TITLES[view];

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 md:px-6">
      <MobileNav />

      <div className="min-w-0 flex flex-1 items-center gap-3">
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground font-mono text-[10px] font-bold">SC</span>
          <ChevronRight className="h-3 w-3 opacity-30" />
          <span className="font-medium tracking-tight text-foreground">{meta.title}</span>
        </div>
        <div className="lg:hidden min-w-0">
          <h1 className="truncate text-[14px] font-semibold tracking-tight leading-none">{meta.title}</h1>
          <p className="truncate text-[11px] text-muted-foreground hidden sm:block leading-none mt-1">{meta.subtitle}</p>
        </div>
        <div className="hidden lg:block h-6 w-px bg-border mx-2" />
        <p className="hidden lg:block text-xs text-muted-foreground truncate">{meta.subtitle}</p>
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setView("upload")}
          className="hidden md:inline-flex h-8 gap-1.5 rounded-md border-border bg-card text-xs font-medium shadow-sm"
        >
          <UploadCloud className="h-3.5 w-3.5" />
          New ingest
        </Button>

        <div className="hidden md:flex items-center gap-1 ml-1 pl-3 border-l border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="h-8 w-8 rounded-md"
          >
            <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
        </div>

        <div className="hidden sm:flex items-center gap-2 ml-1">
          <div className="h-7 w-7 rounded-full bg-muted border flex items-center justify-center text-[10px] font-semibold">OP</div>
          <div className="hidden xl:block leading-none">
            <div className="text-xs font-medium leading-none">Operator</div>
            <div className="text-[11px] text-muted-foreground leading-none">Reviewer</div>
          </div>
        </div>
      </div>
    </header>
  );
}
