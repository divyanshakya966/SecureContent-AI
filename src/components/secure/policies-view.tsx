"use client";

import { useEffect, useState } from "react";
import { ScrollText, ShieldCheck, ShieldX, EyeOff, Ban, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/api-client";
import type { PolicyRule } from "@/types";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, ClassificationBadge } from "@/components/secure/badges";
import { cn } from "@/lib/utils";

export function PoliciesView() {
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);

  useEffect(() => {
    api.getPolicies().then(setPolicies).catch(() => setPolicies([]));
  }, []);

  if (!policies) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/30 bg-primary/5 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10 text-primary">
            <ScrollText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Policy engine</h3>
            <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
              A transformation policy defines what the generated output is allowed to contain. Findings
              are routed into one of four buckets — <span className="font-medium text-foreground">allow</span>, <span className="font-medium text-foreground">mask</span>, <span className="font-medium text-foreground">remove</span>, <span className="font-medium text-foreground">block</span> — before the model ever sees the content. This turns the system from a wrapper into a control plane.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {policies.map((p) => (
          <Card key={p.id} className="p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold">{p.name.replace(/_/g, " ")}</h3>
                  <ClassificationBadge value={p.classification as any} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
              </div>
              {p.active ? (
                <Badge className="bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30">Active</Badge>
              ) : (
                <Badge className="bg-muted text-muted-foreground border-border">Inactive</Badge>
              )}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <PolicyBucket icon={CheckCircle2} label="Allow" items={p.allow} tone="safe" />
              <PolicyBucket icon={EyeOff} label="Mask" items={p.mask} tone="low" />
              <PolicyBucket icon={ShieldX} label="Remove" items={p.remove} tone="medium" />
              <PolicyBucket icon={Ban} label="Block" items={p.block} tone="critical" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function PolicyBucket({ icon: Icon, label, items, tone }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  items: string[];
  tone: "safe" | "low" | "medium" | "critical";
}) {
  const toneCls = {
    safe: "border-[var(--risk-safe)]/30 bg-[var(--risk-safe)]/5 text-[var(--risk-safe)]",
    low: "border-[var(--risk-low)]/30 bg-[var(--risk-low)]/5 text-[var(--risk-low)]",
    medium: "border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/5 text-[var(--risk-medium)]",
    critical: "border-[var(--risk-critical)]/30 bg-[var(--risk-critical)]/5 text-[var(--risk-critical)]",
  }[tone];

  return (
    <div className="rounded-lg border border-border p-3">
      <div className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", toneCls)}>
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="text-[11px] text-muted-foreground">—</span>
        ) : (
          items.map((it) => (
            <span key={it} className="font-mono text-[10px] rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
              {it}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
