"use client";

import { ShieldCheck, LayoutDashboard, UploadCloud, FileStack, ScrollText, BookLock, Network, Github, Brain, Scale, HelpCircle, Search } from "lucide-react";
import { useApp, type ViewKey } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  key: ViewKey;
  label: string;
  simpleLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  proDesc: string;
  group: "primary" | "analyze" | "govern";
};

const NAV: NavItem[] = [
  { key: "dashboard", label: "Overview", simpleLabel: "Overview", icon: LayoutDashboard, desc: "Risk and activity", proDesc: "Risk and activity", group: "primary" },
  { key: "upload", label: "Ingest", simpleLabel: "Ingest", icon: UploadCloud, desc: "Upload or paste", proDesc: "Upload or paste", group: "primary" },
  { key: "documents", label: "Documents", simpleLabel: "Documents", icon: FileStack, desc: "Inventory", proDesc: "Inventory", group: "primary" },
  { key: "intelligence", label: "Intelligence", simpleLabel: "Intelligence", icon: Brain, desc: "Entities · IOCs · TTPs", proDesc: "Entities · IOCs · TTPs", group: "analyze" },
  { key: "policy-compare", label: "Policy Lab", simpleLabel: "Policy Lab", icon: Scale, desc: "Compare policies", proDesc: "Compare policies", group: "analyze" },
  { key: "policies", label: "Policies", simpleLabel: "Policies", icon: ScrollText, desc: "Rules", proDesc: "Rules", group: "govern" },
  { key: "audit", label: "Audit", simpleLabel: "Audit", icon: BookLock, desc: "Trail", proDesc: "Trail", group: "govern" },
  { key: "architecture", label: "Architecture", simpleLabel: "Architecture", icon: Network, desc: "Pipeline", proDesc: "Pipeline", group: "govern" },
];

export function Sidebar() {
  const { view, setView, persona, setCommandOpen, setHelpOpen } = useApp();

  const groups: { id: "primary" | "analyze" | "govern"; title: string; simpleTitle: string }[] = [
    { id: "primary", title: "General", simpleTitle: "General" },
    { id: "analyze", title: "Analysis", simpleTitle: "Analysis" },
    { id: "govern", title: "Governance", simpleTitle: "Governance" },
  ];

  return (
    <aside className="hidden md:flex w-[248px] shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary/15 border border-sidebar-primary/30">
          <ShieldCheck className="h-4.5 w-4.5 text-sidebar-primary" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">SecureContent</div>
          <div className="text-[10px] tracking-wide text-sidebar-foreground/60">Content Security</div>
        </div>
      </div>

      {/* Quick search trigger — removes hidden-feature trap */}
      <div className="px-3 pt-3">
        <button
          onClick={() => setCommandOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-left"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1">Jump to…</span>
          <span className="font-mono text-[10px] border border-sidebar-border rounded px-1 py-0.5">⌘K</span>
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-4 overflow-auto scroll-thin">
        <TooltipProvider delayDuration={200}>
          {groups.map((g) => (
            <div key={g.id}>
              <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
                {persona === "simple" ? g.simpleTitle : g.title}
              </div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g.id).map((item) => {
                  const active = view === item.key;
                  const Icon = item.icon;
                  const label = persona === "simple" ? item.simpleLabel : item.label;
                  const desc = persona === "simple" ? item.desc : item.proDesc;
                  return (
                    <Tooltip key={item.key}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setView(item.key)}
                          className={cn(
                            "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors text-left",
                            active
                              ? "bg-sidebar-accent text-sidebar-foreground"
                              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                          )}
                        >
                          <Icon className={cn("h-4 w-4 shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
                          <div className="min-w-0 flex-1">
                            <div className="font-medium leading-none">{label}</div>
                            <div className="text-[11px] leading-none mt-1 text-sidebar-foreground/50 truncate">{desc}</div>
                          </div>
                          {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary shrink-0" />}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[240px]">
                        <div className="font-medium">{persona === "simple" ? item.simpleLabel : item.label}</div>
                        <div className="text-xs text-muted-foreground">{persona === "simple" ? item.desc : item.proDesc}</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>

      <div className="border-t border-sidebar-border p-3 space-y-2">
        <button
          onClick={() => setHelpOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2 text-xs text-sidebar-foreground/80 hover:bg-sidebar-accent/60 transition-colors text-left"
        >
          <HelpCircle className="h-3.5 w-3.5 text-sidebar-primary" />
          <span className="font-medium">Help</span>
          <span className="ml-auto font-mono text-[10px] border border-sidebar-border rounded px-1 py-0.5">?</span>
        </button>
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5">
          <div className="text-[10px] tracking-wide text-sidebar-foreground/50">Pipeline</div>
          <div className="text-xs text-sidebar-foreground/80">Scan → Sanitize → Validate</div>
        </div>
      </div>
    </aside>
  );
}
