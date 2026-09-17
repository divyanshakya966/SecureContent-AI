"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api-client";
import type { AuditLogEntry } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/secure/badges";
import { formatRelativeTime } from "@/lib/display";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { documentPath } from "@/lib/nav";
import { cn } from "@/lib/utils";
import { Search, Terminal, Clock3 } from "lucide-react";

const ACTION_TONE: Record<string, string> = {
  UPLOAD: "bg-muted text-muted-foreground border-border",
  DELETE: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  BULK_DELETE: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  BULK_INGEST: "bg-primary/10 text-primary border-primary/30",
  SCAN: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30",
  POLICY_APPLY: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  POLICY_CREATE: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30",
  POLICY_UPDATE: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30",
  POLICY_DELETE: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  POLICY_COMPARE: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  INTELLIGENCE_EXTRACT: "bg-[var(--chart-5)]/10 text-[var(--chart-5)] border-[var(--chart-5)]/30",
  SANITIZE: "bg-[var(--risk-low)]/10 text-[var(--risk-low)] border-[var(--risk-low)]/30",
  TRANSFORM: "bg-primary/10 text-primary border-primary/30",
  DLP_BLOCK: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30",
  RELEASE: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30",
};

export function AuditView() {
  const { refreshKey } = useApp();
  const router = useRouter();
  const openDocument = (id: string) => router.push(documentPath(id));
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

  const isEmpty = audit.length === 0;

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border bg-muted"><Terminal className="h-3.5 w-3.5 text-muted-foreground" /></span>
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Audit trail</h3>
              <p className="text-xs text-muted-foreground">
                {isEmpty ? "Awaiting ingestion" : `${audit.length} entries · newest first · immutable`}
              </p>
            </div>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by action, actor or detail"
              className="h-8 pl-8 text-xs bg-muted/30 border-border"
              disabled={isEmpty}
            />
          </div>
        </div>

      <div className="max-h-[calc(100vh-280px)] overflow-auto scroll-thin">
        {isEmpty ? (
          <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 px-6 py-10 text-center">
            <Clock3 className="h-5 w-5 text-muted-foreground opacity-50" />
            <p className="text-xs text-muted-foreground">Ingest a document to populate this trail. No mock data is shown.</p>
          </div>
        ) : (
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
                    <Badge className={ACTION_TONE[a.action] ?? ACTION_TONE.UPLOAD}>{a.action}</Badge>
                    <span className="font-mono text-[11px] text-muted-foreground">{a.actor}</span>
                    {a.documentId && <span className="text-[11px] text-primary">→ open file</span>}
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
        )}
      </div>
      </Card>
    </div>
  );
}
