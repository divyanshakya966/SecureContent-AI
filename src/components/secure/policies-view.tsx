"use client";

import { useEffect, useState } from "react";
import { ScrollText, ShieldX, EyeOff, Ban, CheckCircle2, Users, Crown, HeartHandshake, Bug, Eye } from "lucide-react";
import { api } from "@/lib/api-client";
import type { PolicyRule } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, ClassificationBadge } from "@/components/secure/badges";
import { cn } from "@/lib/utils";

const META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  PUBLIC_RELEASE: { icon: Eye, color: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/20" },
  INTERNAL_SUMMARY: { icon: Users, color: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/20" },
  EXECUTIVE_BRIEF: { icon: Crown, color: "bg-[var(--chart-2)]/12 text-[var(--chart-2)] border-[var(--chart-2)]/20" },
  HR_SAFE: { icon: HeartHandshake, color: "bg-[var(--chart-5)]/10 text-[var(--chart-5)] border-[var(--chart-5)]/20" },
  SECURITY_INCIDENT: { icon: Bug, color: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/20" },
};

export function PoliciesView() {
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  useEffect(() => { api.getPolicies().then(setPolicies).catch(() => setPolicies([])); }, []);
  if (!policies) return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className="p-4 flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border bg-muted shrink-0"><ScrollText className="h-4 w-4 text-muted-foreground" /></div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight">Transformation policies</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Five audience-scoped profiles. Each defines <span className="font-medium text-foreground">allow / mask / remove / block</span> buckets over finding types and is enforced before model access.</p>
        </div>
        <span className="hidden sm:inline-flex ml-auto shrink-0 rounded-full border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{policies.length} profiles</span>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {policies.map((p) => {
          const m = META[p.name] ?? META.PUBLIC_RELEASE;
          const Icon = m.icon;
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${m.color}`}><Icon className="h-3.5 w-3.5" /></span>
                  <h3 className="text-sm font-semibold tracking-tight truncate">{p.name.replace(/_/g, " ")}</h3>
                  <ClassificationBadge value={p.classification as any} />
                </div>
                <Badge className={p.active ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-muted text-muted-foreground border-border"}>{p.active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground line-clamp-2">{p.description}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Bucket icon={CheckCircle2} label="Allow" items={p.allow} tone="safe" />
                <Bucket icon={EyeOff} label="Mask" items={p.mask} tone="low" />
                <Bucket icon={ShieldX} label="Remove" items={p.remove} tone="medium" />
                <Bucket icon={Ban} label="Block" items={p.block} tone="critical" />
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Bucket({ icon: Icon, label, items, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; items: string[]; tone: "safe" | "low" | "medium" | "critical" }) {
  const cls = {
    safe: "border-[var(--risk-safe)]/30 bg-[var(--risk-safe)]/5 text-[var(--risk-safe)]",
    low: "border-[var(--risk-low)]/30 bg-[var(--risk-low)]/5 text-[var(--risk-low)]",
    medium: "border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/5 text-[var(--risk-medium)]",
    critical: "border-[var(--risk-critical)]/30 bg-[var(--risk-critical)]/5 text-[var(--risk-critical)]",
  }[tone];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", cls)}><Icon className="h-3 w-3" /> {label}</div>
      <div className="mt-2 flex flex-wrap gap-1">
        {items.length === 0 ? <span className="text-[11px] text-muted-foreground">—</span> : items.map((it) => <span key={it} className="font-mono text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">{it}</span>)}
      </div>
    </div>
  );
}
