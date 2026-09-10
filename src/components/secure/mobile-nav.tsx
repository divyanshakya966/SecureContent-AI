"use client";

import { useState } from "react";
import { Menu, ShieldCheck, X } from "lucide-react";
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
  const { view, setView } = useApp();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden h-9 w-9" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-[320px] p-0 bg-sidebar text-sidebar-foreground border-sidebar-border flex flex-col">
        <SheetHeader className="flex flex-row items-center gap-2.5 px-5 h-16 border-b border-sidebar-border shrink-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary/15 border border-sidebar-primary/30">
            <ShieldCheck className="h-4 w-4 text-sidebar-primary" />
          </div>
          <div className="leading-tight text-left">
            <SheetTitle className="text-sm font-semibold tracking-tight text-sidebar-foreground">SecureContent</SheetTitle>
            <div className="text-[10px] tracking-wide text-sidebar-foreground/60">Content Security</div>
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

        <div className="border-t border-sidebar-border p-3">
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5">
            <div className="text-[10px] tracking-wide text-sidebar-foreground/50">Pipeline</div>
            <div className="text-xs text-sidebar-foreground/80">Scan → Sanitize → Validate</div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
