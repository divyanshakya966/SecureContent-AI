"use client";

import { useEffect, useState } from "react";
import {
  FileStack, ShieldAlert, KeyRound, CheckCircle2, Activity, ArrowDownRight, Loader2,
} from "lucide-react";
import { api } from "@/lib/api-client";
import type { DashboardStats } from "@/types";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
  PieChart, Pie, Legend,
} from "recharts";
import { formatRelativeTime, riskColor } from "@/lib/display";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "danger" | "success";
}

function StatCard({ icon: Icon, label, value, hint, tone = "default" }: StatCardProps) {
  return (
    <Card className="relative overflow-hidden p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border",
            tone === "danger"
              ? "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30"
              : tone === "success"
              ? "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30"
              : "bg-muted text-muted-foreground border-border"
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

export function DashboardView() {
  const { refreshKey, openDocument, setView } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    api.getStats()
      .then((s) => active && setStats(s))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-72 rounded-xl lg:col-span-2" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Could not load stats: {error}</p>
        <Button className="mt-3" onClick={() => setView("upload")}>Ingest your first document</Button>
      </Card>
    );
  }

  const empty = stats.totalDocuments === 0;

  return (
    <div className="space-y-4">
      {empty && (
        <Card className="border-primary/30 bg-primary/5 p-5">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold">No documents ingested yet</div>
              <p className="mt-1 text-xs text-muted-foreground max-w-xl">
                The console is empty. Load one of the synthetic attack samples to see the security
                pipeline run end-to-end — detection, sanitization, grounded transformation and the
                output release gate.
              </p>
            </div>
            <Button onClick={() => setView("upload")}>Ingest content</Button>
          </div>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard icon={FileStack} label="Documents" value={stats.totalDocuments} hint={`${stats.scannedDocuments} scanned`} />
        <StatCard icon={ShieldAlert} label="High risk" value={stats.highRiskDocuments} hint={`${stats.blockedDocuments} blocked by policy`} tone="danger" />
        <StatCard icon={KeyRound} label="Secrets blocked" value={stats.secretsBlocked} hint={`${stats.injectionBlocked} injection attempts`} tone="danger" />
        <StatCard icon={CheckCircle2} label="Safe outputs" value={stats.safeOutputsReleased} hint="Passed output DLP" tone="success" />
        <StatCard
          icon={ArrowDownRight}
          label="Avg risk Δ"
          value={stats.avgRiskReduction > 0 ? `−${stats.avgRiskReduction}` : "0"}
          hint={`${stats.piiDetected} PII findings detected`}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Risk reduction by document</h3>
              <p className="text-xs text-muted-foreground">Before sanitization vs. after the release gate</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 h-64">
            {stats.riskTrend.length === 0 ? (
              <EmptyChart label="No documents yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.riskTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }} interval={0} stroke="var(--muted-foreground)" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                    formatter={(value: any, name: any) => [value, name === "before" ? "Before sanitization" : "After release"]}
                    labelFormatter={(_label, payload) => {
                      const item = payload?.[0]?.payload as { title?: string } | undefined;
                      return item?.title ?? _label;
                    }}
                  />
                  <Bar dataKey="before" name="Before" radius={[3, 3, 0, 0]} fill="var(--risk-critical)" fillOpacity={0.85} />
                  <Bar dataKey="after" name="After" radius={[3, 3, 0, 0]} fill="var(--risk-safe)" fillOpacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Findings by category</h3>
          <p className="text-xs text-muted-foreground">Detected across all inputs</p>
          <div className="mt-4 h-64">
            {stats.findingsByCategory.length === 0 ? (
              <EmptyChart label="No findings yet" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.findingsByCategory}
                    dataKey="count"
                    nameKey="category"
                    innerRadius={48}
                    outerRadius={80}
                    paddingAngle={2}
                    stroke="var(--background)"
                  >
                    {stats.findingsByCategory.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Recent activity</h3>
            <Button variant="ghost" size="sm" onClick={() => setView("audit")} className="h-7 text-xs">View all</Button>
          </div>
          <div className="mt-3 max-h-72 overflow-y-auto scroll-thin pr-1">
            {stats.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ol className="space-y-2">
                {stats.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-medium text-foreground">{a.action}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="text-muted-foreground">{a.actor}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{a.detail}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">{formatRelativeTime(a.timestamp)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Classification distribution</h3>
          <p className="text-xs text-muted-foreground">Auto-assigned at scan time</p>
          <div className="mt-4 space-y-3">
            {stats.documentsByClassification.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">No documents yet.</p>
            ) : (
              stats.documentsByClassification
                .sort((a, b) => rankClass(a.classification) - rankClass(b.classification))
                .map((c) => {
                  const total = stats.documentsByClassification.reduce((s, x) => s + x.count, 0);
                  const pct = total ? Math.round((c.count / total) * 100) : 0;
                  return (
                    <div key={c.classification}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono">{c.classification}</span>
                        <span className="text-muted-foreground tabular-nums">{c.count} · {pct}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${pct}%`, backgroundColor: classColor(c.classification) }}
                        />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 opacity-40" />
        <span className="text-xs">{label}</span>
      </div>
    </div>
  );
}

function rankClass(c: string): number {
  return { RESTRICTED: 0, CONFIDENTIAL: 1, INTERNAL: 2, PUBLIC: 3, UNCLASSIFIED: 4 }[c] ?? 5;
}
function classColor(c: string): string {
  return {
    RESTRICTED: "var(--risk-critical)",
    CONFIDENTIAL: "var(--risk-medium)",
    INTERNAL: "var(--chart-4)",
    PUBLIC: "var(--risk-low)",
    UNCLASSIFIED: "var(--muted-foreground)",
  }[c] ?? "var(--muted-foreground)";
}
