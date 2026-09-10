"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { AuditLogEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/secure/badges";
import { formatRelativeTime } from "@/lib/display";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Search, Terminal } from "lucide-react";

const ACTION_TONE: Record<string, string> = {
  UPLOAD: "bg-muted text-muted-foreground border-border",
  SCAN: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30",
  POLICY_APPLY: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  SANITIZE: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  TRANSFORM: "bg-primary/10 text-primary border-primary/30",
  DLP_BLOCK: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  RELEASE: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30",
};

export function AuditView() {
  const { refreshKey, openDocument, persona } = useApp();
  const [audit, setAudit] = useState<AuditLogEntry[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.getAudit().then(setAudit).catch(() => setAudit([]));
  }, [refreshKey]);

  const filtered = (audit ?? []).filter((a) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return a.action.toLowerCase().includes(q) || a.actor.toLowerCase().includes(q) || a.detail.toLowerCase().includes(q);
  });

  if (!audit) {
    return (
      <Card className="p-5">
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {persona === "simple" && (
        <Card className="p-3 flex items-start gap-2 bg-primary/5 border-primary/20">
          <Terminal className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">Activity log:</span> every check, clean and generate is recorded with time. Tap any entry with a file to open it. Use the search to find e.g. “blocked” or “scan”.
          </div>
        </Card>
      )}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">{persona === "simple" ? "Activity log" : "Audit trail"}</h3>
              <p className="text-xs text-muted-foreground">{audit.length} entries · newest first {persona === "simple" ? "· tap to open file" : ""}</p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={persona === "simple" ? "Search e.g. ‘scan’, ‘blocked’…": "Filter by action, actor or detail…"}
              className="h-9 pl-8"
            />
          </div>
        </div>

      <div className="max-h-[calc(100vh-280px)] overflow-auto scroll-thin">
        <ol className="divide-y divide-border">
          {filtered.map((a) => (
            <li
              key={a.id}
              className={cn("flex items-start gap-3 px-4 py-3", a.documentId ? "cursor-pointer hover:bg-muted/40" : "")}
              onClick={() => a.documentId && openDocument(a.documentId)}
            >
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] uppercase text-muted-foreground">
                {a.actor.slice(0, 2)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={ACTION_TONE[a.action] ?? ACTION_TONE.UPLOAD}>{persona === "simple" ? (a.action === "SCAN" ? "Checked" : a.action === "SANITIZE" ? "Cleaned" : a.action === "TRANSFORM" ? "Generated" : a.action) : a.action}</Badge>
                  <span className="font-mono text-[11px] text-muted-foreground">{a.actor}</span>
                  {a.documentId && <span className="text-[11px] text-primary hidden sm:inline">→ open file</span>}
                </div>
                <p className="mt-1 text-xs text-foreground/80">{a.detail}</p>
              </div>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                {formatRelativeTime(a.timestamp)}
              </span>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-4 py-12 text-center text-sm text-muted-foreground">No matching audit entries.</li>
          )}
        </ol>
      </div>
      </Card>
    </div>
  );
}
