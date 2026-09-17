"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { usePathname, useRouter } from "next/navigation";
import { Moon, Sun, UploadCloud, ChevronRight, KeyRound } from "lucide-react";
import { type ViewKey } from "@/lib/store";
import { ROUTES, viewFromPathname } from "@/lib/nav";
import { Button } from "@/components/ui/button";
import { MobileNav } from "@/components/secure/mobile-nav";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { getApiToken, setApiToken } from "@/lib/api-client";

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
  const router = useRouter();
  const view = viewFromPathname(usePathname());
  const { theme, setTheme } = useTheme();
  const meta = TITLES[view];
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenValue, setTokenValue] = useState<string | null>(null);
  const [tokenInput, setTokenInput] = useState("");

  useEffect(() => {
    setTokenValue(getApiToken());
  }, []);

  function openTokenDialog() {
    setTokenValue(getApiToken());
    setTokenInput("");
    setTokenOpen(true);
  }

  return (
    <header className="sticky top-0 z-30 flex h-[56px] items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70 md:px-6">
      <MobileNav />

      <div className="min-w-0 flex flex-1 items-center gap-3">
        <div className="hidden lg:flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <img src="/logo.svg" alt="SecureContent AI" className="h-6 w-6 rounded-md shadow-sm" />
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
          onClick={() => router.push(ROUTES.upload)}
          className="hidden md:inline-flex h-8 gap-1.5 rounded-md border-border bg-card text-xs font-medium shadow-sm"
        >
          <UploadCloud className="h-3.5 w-3.5" />
          New ingest
        </Button>
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push(ROUTES.upload)}
          aria-label="New ingest"
          className="md:hidden h-8 w-8 rounded-md border-border bg-card shadow-sm"
        >
          <UploadCloud className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 ml-1 pl-2 md:pl-3 md:border-l md:border-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={openTokenDialog}
            aria-label="API token"
            title={tokenValue ? "API token set" : "Set API token (required when server sets API_AUTH_TOKEN)"}
            className="h-8 w-8 rounded-md relative"
          >
            <KeyRound className="h-4 w-4" />
            {tokenValue && <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />}
          </Button>
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
      </div>

      <Dialog open={tokenOpen} onOpenChange={setTokenOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-sm">API token</DialogTitle></DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Required only when the server sets <span className="font-mono">API_AUTH_TOKEN</span>.
            Stored in this browser only (localStorage), sent as <span className="font-mono">Authorization: Bearer</span> on
            write requests. Status: {tokenValue ? <span className="font-medium text-emerald-600">set</span> : <span className="font-medium">not set</span>}.
          </p>
          <input
            type="password"
            autoComplete="off"
            placeholder="Paste API token…"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-xs outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
          <DialogFooter className="gap-2">
            {tokenValue && (
              <Button variant="outline" size="sm" onClick={() => { setApiToken(null); setTokenValue(null); setTokenInput(""); }}>Clear</Button>
            )}
            <Button size="sm" disabled={!tokenInput.trim()} onClick={() => { setApiToken(tokenInput); setTokenValue(tokenInput.trim()); setTokenInput(""); setTokenOpen(false); }}>Save token</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
