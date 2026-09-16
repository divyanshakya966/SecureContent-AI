"use client";

import { useState } from "react";
import { Menu, ShieldCheck, Moon, Sun, Search, HelpCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { useApp, type ViewKey } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  UploadCloud,
  FileStack,
  Brain,
  Scale,
  ScrollText,
  BookLock,
  Network,
} from "lucide-react";

const NAV: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }>; desc: string }[] = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard, desc: "Risk and activity" },
  { key: "upload", label: "Ingest", icon: UploadCloud, desc: "Upload or paste" },
  { key: "documents", label: "Documents", icon: FileStack, desc: "Inventory" },
  { key: "intelligence", label: "Intelligence", icon: Brain, desc: "Entities · IOCs · TTPs" },
  { key: "policy-compare", label: "Policy Lab", icon: Scale, desc: "Compare policies" },
  { key: "policies", label: "Policies", icon: ScrollText, desc: "Rules" },
  { key: "audit", label: "Audit", icon: BookLock, desc: "Trail" },
  { key: "architecture", label: "Architecture", icon: Network, desc: "Pipeline" },
];

export function MobileNav() {
  const { view, setView, setCommandOpen, setHelpOpen } = useApp();
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
        <SheetHeader className="flex flex-row items-center gap-2.5 px-4 h-[56px] border-b border-sidebar-border shrink-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="leading-none text-left">
            <SheetTitle className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">SecureContent AI</SheetTitle>
            <div className="text-[10px] font-medium tracking-wide text-sidebar-foreground/50">v1.0 · Local</div>
          </div>
        </SheetHeader>

        <nav className="flex-1 overflow-auto px-3 py-4 space-y-1">
          <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
            Navigation
          </div>
          {NAV.map((item) => {
            const active = view === item.key;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => {
                  setView(item.key);
                  setOpen(false);
                }}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/50")} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium leading-none">{item.label}</div>
                  <div className="text-[11px] text-sidebar-foreground/50 leading-none mt-1">{item.desc}</div>
                </div>
                {active && <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary shrink-0" />}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3 space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={() => { setOpen(false); setCommandOpen(true); }}
              className="flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border px-2 py-2 text-[11px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <Search className="h-3.5 w-3.5" /> Search
            </button>
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border px-2 py-2 text-[11px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />} Theme
            </button>
            <button
              onClick={() => { setOpen(false); setHelpOpen(true); }}
              className="flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border px-2 py-2 text-[11px] font-medium text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
            >
              <HelpCircle className="h-3.5 w-3.5" /> Help
            </button>
          </div>
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5">
            <div className="text-[10px] tracking-wide text-sidebar-foreground/50">Pipeline</div>
            <div className="text-xs text-sidebar-foreground/80">Scan → Sanitize → Validate</div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
