"use client";

import { useEffect, useState } from "react";
import { ScrollText, ShieldX, EyeOff, Ban, CheckCircle2, Users, Crown, HeartHandshake, Bug, Eye } from "lucide-react";
import { api } from "@/lib/api-client";
import type { PolicyRule } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, ClassificationBadge } from "@/components/secure/badges";
import { cn } from "@/lib/utils";

const META: Record<string, { icon: any; color: string }> = {
  PUBLIC_RELEASE: { icon: Eye, color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
  INTERNAL_SUMMARY: { icon: Users, color: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  EXECUTIVE_BRIEF: { icon: Crown, color: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  HR_SAFE: { icon: HeartHandshake, color: "bg-violet-500/10 text-violet-700 border-violet-500/30" },
  SECURITY_INCIDENT: { icon: Bug, color: "bg-red-500/10 text-red-700 border-red-500/30" },
};

export function PoliciesView() {
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  useEffect(() => { api.getPolicies().then(setPolicies).catch(() => setPolicies([])); }, []);
  if (!policies) return <div className="grid gap-4 lg:grid-cols-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}</div>;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border bg-muted"><ScrollText className="h-4 w-4" /></div>
          <div>
            <h3 className="text-sm font-semibold">Policies</h3>
            <p className="mt-1 text-xs text-muted-foreground">Define allowed, masked, removed, and blocked content per profile. Applied before model access.</p>
          </div>
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        {policies.map((p) => {
          const m = META[p.id] ?? META.PUBLIC_RELEASE;
          const Icon = m.icon;
          return (
            <Card key={p.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${m.color}`}><Icon className="h-3.5 w-3.5" /></span>
                  <h3 className="text-sm font-semibold">{p.name.replace(/_/g, " ")}</h3>
                  <ClassificationBadge value={p.classification as any} />
                </div>
                <Badge className={p.active ? "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30" : "bg-muted text-muted-foreground border-border"}>{p.active ? "Active" : "Inactive"}</Badge>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">{p.description}</p>
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
