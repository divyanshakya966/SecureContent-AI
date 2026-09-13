"use client";

import { ShieldCheck, LayoutDashboard, UploadCloud, FileStack, ScrollText, BookLock, Network, Brain, Scale, HelpCircle, Search } from "lucide-react";
import { useApp, type ViewKey } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type NavItem = {
  key: ViewKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  desc: string;
  group: "primary" | "analyze" | "govern";
};

const NAV: NavItem[] = [
  { key: "dashboard", label: "Overview", icon: LayoutDashboard, desc: "Risk and activity", group: "primary" },
  { key: "upload", label: "Ingest", icon: UploadCloud, desc: "Upload or paste", group: "primary" },
  { key: "documents", label: "Documents", icon: FileStack, desc: "Inventory", group: "primary" },
  { key: "intelligence", label: "Intelligence", icon: Brain, desc: "Entities · IOCs · TTPs", group: "analyze" },
  { key: "policy-compare", label: "Policy Lab", icon: Scale, desc: "Compare policies", group: "analyze" },
  { key: "policies", label: "Policies", icon: ScrollText, desc: "Rules", group: "govern" },
  { key: "audit", label: "Audit", icon: BookLock, desc: "Trail", group: "govern" },
  { key: "architecture", label: "Architecture", icon: Network, desc: "Pipeline", group: "govern" },
];

export function Sidebar() {
  const { view, setView, setCommandOpen, setHelpOpen } = useApp();

  const groups: { id: "primary" | "analyze" | "govern"; title: string }[] = [
    { id: "primary", title: "Workspace" },
    { id: "analyze", title: "Analysis" },
    { id: "govern", title: "Governance" },
  ];

  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2.5 px-4 h-[56px] border-b border-sidebar-border shrink-0">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="leading-none">
          <div className="text-[13px] font-semibold tracking-tight text-sidebar-foreground">SecureContent AI</div>
          <div className="text-[10px] font-medium tracking-wide text-sidebar-foreground/50">v1.0 · Production</div>
        </div>
      </div>

      <div className="px-2.5 pt-3">
        <button
          onClick={() => setCommandOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/50 px-2.5 py-2 text-[12px] font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent hover:border-sidebar-foreground/10 transition-colors text-left"
        >
          <Search className="h-3.5 w-3.5 opacity-60" />
          <span className="flex-1">Search</span>
          <span className="hidden lg:inline-flex items-center gap-1 font-mono text-[10px] text-sidebar-foreground/40 border border-sidebar-border rounded px-1.5 py-0.5">⌘ K</span>
        </button>
      </div>

      <nav className="flex-1 px-2.5 py-4 space-y-5 overflow-auto scroll-thin">
        <TooltipProvider delayDuration={200}>
          {groups.map((g) => (
            <div key={g.id}>
              <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/35">
                {g.title}
              </div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === g.id).map((item) => {
                  const active = view === item.key;
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.key}>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => setView(item.key)}
                          className={cn(
                            "group relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] leading-none transition-colors text-left",
                            active
                              ? "bg-sidebar-accent text-sidebar-foreground shadow-sm"
                              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                          )}
                        >
                          {active && <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-primary" />}
                          <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-sidebar-primary" : "text-sidebar-foreground/45 group-hover:text-sidebar-foreground/75")} />
                          <span className={cn("flex-1 font-[450]", active && "font-medium")}>{item.label}</span>
                          <span className="hidden xl:block text-[11px] text-sidebar-foreground/35 truncate max-w-[110px]">{item.desc}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[260px] text-xs">
                        <div className="font-medium">{item.label}</div>
                        <div className="text-muted-foreground">{item.desc}</div>
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </div>
          ))}
        </TooltipProvider>
      </nav>

      <div className="border-t border-sidebar-border p-2.5 space-y-2">
        <button
          onClick={() => setHelpOpen(true)}
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-xs font-medium text-sidebar-foreground/75 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-left"
        >
          <HelpCircle className="h-4 w-4 text-sidebar-foreground/40" />
          <span>Help & reference</span>
          <span className="ml-auto font-mono text-[10px] border border-sidebar-border rounded px-1 py-0.5 text-sidebar-foreground/40">?</span>
        </button>
        <div className="rounded-md border border-sidebar-border bg-sidebar-accent/30 px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground/40">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            System operational
          </div>
          <div className="mt-1 text-xs font-medium text-sidebar-foreground/75">Scan → Sanitize → Validate</div>
          <div className="text-[11px] text-sidebar-foreground/45">Double-gate DLP enabled</div>
        </div>
      </div>
    </aside>
  );
}
