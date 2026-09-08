"use client";

import { ShieldCheck, LayoutDashboard, UploadCloud, FileStack, ScrollText, BookLock, Network, Github } from "lucide-react";
import { useApp, type ViewKey } from "@/lib/store";
import { cn } from "@/lib/utils";

const NAV: { key: ViewKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "dashboard", label: "Operations", icon: LayoutDashboard },
  { key: "upload", label: "Ingest Content", icon: UploadCloud },
  { key: "documents", label: "Documents", icon: FileStack },
  { key: "policies", label: "Policies", icon: ScrollText },
  { key: "audit", label: "Audit Trail", icon: BookLock },
  { key: "architecture", label: "Architecture", icon: Network },
];

export function Sidebar() {
  const { view, setView } = useApp();
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-sidebar-border">
        <div className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-primary/15 border border-sidebar-primary/30">
          <ShieldCheck className="h-5 w-5 text-sidebar-primary" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sidebar-primary shadow-[0_0_8px_var(--sidebar-primary)]" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold tracking-tight text-sidebar-foreground">SecureContent</div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-sidebar-primary/80">AI · zero-trust</div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        <div className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/40">
          Workspace
        </div>
        {NAV.map((item) => {
          const active = view === item.key;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              onClick={() => setView(item.key)}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon className={cn("h-4 w-4", active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground/80")} />
              <span className="font-medium">{item.label}</span>
              {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-sidebar-primary" />}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4 space-y-3">
        <div className="rounded-lg border border-sidebar-border bg-sidebar-accent/40 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/50">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--risk-safe)] animate-pulse" />
            Security posture
          </div>
          <div className="mt-1.5 text-xs leading-relaxed text-sidebar-foreground/80">
            Detect → Sanitize → Transform → Validate
          </div>
          <div className="mt-2 font-mono text-[10px] text-sidebar-foreground/40">
            OWASP GenAI LLM Top 10 · 2026
          </div>
        </div>
        <a
          href="https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 text-[11px] text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
        >
          <Github className="h-3.5 w-3.5" />
          Aligned to OWASP 2026 controls
        </a>
      </div>
    </aside>
  );
}
