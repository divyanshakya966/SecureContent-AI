"use client";

import { useEffect, useState } from "react";
import {
  FileStack, ShieldAlert, KeyRound, CheckCircle2, ArrowDownRight, Brain, Globe, Crosshair,
  Inbox, BarChart3, PieChart as PieIcon, Clock3, Layers,
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
import { formatRelativeTime } from "@/lib/display";
import { cn } from "@/lib/utils";

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint?: string;
  tone?: "default" | "danger" | "success";
  empty?: boolean;
}

function StatCard({ icon: Icon, label, value, hint, tone = "default", empty }: StatCardProps) {
  return (
    <Card className={cn("relative overflow-hidden p-4", empty && "bg-muted/10")}>
      {tone !== "default" && !empty && (
        <span
          className="absolute inset-x-0 top-0 h-0.5"
          style={{
            background:
              tone === "danger"
                ? "var(--risk-critical)"
                : tone === "success"
                ? "var(--risk-safe)"
                : "var(--border)",
          }}
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className={cn("mt-2 font-mono text-[22px] font-semibold leading-none tabular-nums tracking-tight", empty && "text-muted-foreground font-medium")}>{value}</div>
          {hint && <div className="mt-1.5 text-xs leading-none text-muted-foreground truncate">{hint}</div>}
        </div>
        <div
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
            empty
              ? "bg-muted/60 text-muted-foreground border-border"
              : tone === "danger"
              ? "bg-[var(--risk-critical)]/8 text-[var(--risk-critical)] border-[var(--risk-critical)]/15"
              : tone === "success"
              ? "bg-[var(--risk-safe)]/8 text-[var(--risk-safe)] border-[var(--risk-safe)]/15"
              : "bg-muted text-muted-foreground border-border"
          )}
        >
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
    </Card>
  );
}

function EmptyPlaceholder({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-3 px-6 py-8 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed bg-muted/40">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-1 max-w-[28ch] text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {actionLabel && onAction && (
        <Button variant="outline" size="sm" className="mt-1 h-7 text-xs" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function DashboardView() {
  const { refreshKey, setView } = useApp();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
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
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-xl" />)}
        </div>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[96px] rounded-xl" />)}
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-[320px] rounded-xl lg:col-span-2" />
          <Skeleton className="h-[320px] rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Could not load stats: {error}</p>
        <Button className="mt-3" onClick={() => setView("upload")}>Ingest document</Button>
      </Card>
    );
  }

  const empty = stats.totalDocuments === 0;

  return (
    <div className="space-y-4">
      {empty && (
        <Card className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-dashed bg-card">
          <div className="flex gap-3">
            <div className="hidden sm:flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted">
              <Inbox className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Awaiting first document</div>
              <p className="mt-1 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
                Ingest a document to populate risk, findings, and intelligence. Metrics reflect genuine pipeline results — no mock data is shown.
              </p>
            </div>
          </div>
          <Button onClick={() => setView("upload")} size="sm" className="shrink-0">
            Ingest document
          </Button>
        </Card>
      )}

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={FileStack}
          label="Documents"
          value={empty ? "—" : stats.totalDocuments}
          hint={empty ? "Awaiting ingestion" : `${stats.scannedDocuments} scanned · ${stats.transformedDocuments} transformed`}
          empty={empty}
        />
        <StatCard
          icon={ShieldAlert}
          label="High risk"
          value={empty ? "—" : stats.highRiskDocuments}
          hint={empty ? "Ingest to analyze" : `${stats.blockedDocuments} blocked`}
          tone={empty ? "default" : "danger"}
          empty={empty}
        />
        <StatCard
          icon={KeyRound}
          label="Secrets"
          value={empty ? "—" : stats.secretsBlocked}
          hint={empty ? "No detections" : `${stats.injectionBlocked} injections`}
          tone={empty ? "default" : "danger"}
          empty={empty}
        />
        <StatCard
          icon={CheckCircle2}
          label="Safe outputs"
          value={empty ? "—" : stats.safeOutputsReleased}
          hint={empty ? "Awaiting transform" : "Passed DLP"}
          tone={empty ? "default" : "success"}
          empty={empty}
        />
        <StatCard
          icon={ArrowDownRight}
          label="Risk reduction"
          value={empty ? "—" : stats.avgRiskReduction > 0 ? `−${stats.avgRiskReduction}` : "0"}
          hint={empty ? "No analysis" : `${stats.piiDetected} PII findings`}
          tone={empty ? "default" : "success"}
          empty={empty}
        />
      </div>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Brain}
          label="Intelligence"
          value={empty ? "—" : stats.totalIntelligenceReports ?? 0}
          hint={empty ? "Awaiting ingestion" : `${stats.totalEntities ?? 0} entities`}
          empty={empty}
        />
        <StatCard
          icon={Globe}
          label="IOCs"
          value={empty ? "—" : stats.totalIOCs ?? 0}
          hint={empty ? "No indicators" : `${stats.totalTTPs ?? 0} TTPs`}
          empty={empty}
        />
        <StatCard
          icon={Crosshair}
          label="TTPs"
          value={empty ? "—" : stats.totalTTPs ?? 0}
          hint={empty ? "Awaiting analysis" : "MITRE ATT&CK"}
          empty={empty}
        />
        <Card className="relative overflow-hidden p-4 bg-card">
          <span className="absolute inset-x-0 top-0 h-0.5 bg-primary" />
          <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Pipeline</div>
          <div className="mt-2 text-sm font-semibold tracking-tight">Scan → Sanitize → Validate</div>
          <div className="mt-1 text-xs text-muted-foreground">Double-gate · Policy-aware</div>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Operational
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Risk reduction</h3>
              <p className="text-xs text-muted-foreground">Before → after sanitization (per document)</p>
            </div>
            <div className="flex items-center gap-2 text-[11px] font-medium">
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--risk-critical)]" /> Before</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-[var(--risk-safe)]" /> After</span>
            </div>
          </div>
          <div className="mt-4 h-[260px]">
            {stats.riskTrend.length === 0 ? (
              <EmptyPlaceholder
                icon={BarChart3}
                title="No analysis yet"
                description="Ingest a document to generate before/after risk comparison. Risk is computed from findings and reduced via policy."
                actionLabel={empty ? "Ingest document" : undefined}
                onAction={empty ? () => setView("upload") : undefined}
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.riskTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={4} barCategoryGap="18%">
                  <XAxis dataKey="label" tick={{ fontSize: 10, fontFamily: "var(--font-mono)", fill: "var(--muted-foreground)" }} interval={0} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, boxShadow: "0 4px 12px oklch(0 0 0 / 0.08)" }}
                    cursor={{ fill: "var(--muted)", opacity: 0.12 }}
                    formatter={(value: any, name: any) => [value, name === "before" ? "Before" : "After"]}
                    labelFormatter={(_label, payload) => (payload?.[0]?.payload as any)?.title ?? _label}
                  />
                  <Bar dataKey="before" name="Before" radius={[4, 4, 0, 0]} fill="var(--risk-critical)" fillOpacity={0.9} />
                  <Bar dataKey="after" name="After" radius={[4, 4, 0, 0]} fill="var(--risk-safe)" fillOpacity={0.95} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Findings by category</h3>
              <p className="text-xs text-muted-foreground">All input findings</p>
            </div>
            <PieIcon className="h-4 w-4 text-muted-foreground/60" />
          </div>
          <div className="mt-4 h-[260px]">
            {stats.findingsByCategory.length === 0 ? (
              <EmptyPlaceholder
                icon={PieIcon}
                title="No findings yet"
                description="Ingest a document to populate breakdown by PII, secrets, injection, and internal assets."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.findingsByCategory} dataKey="count" nameKey="category" innerRadius={52} outerRadius={82} paddingAngle={3} stroke="var(--card)" strokeWidth={2}>
                    {stats.findingsByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold tracking-tight">Recent activity</h3>
            <Button variant="ghost" size="sm" onClick={() => setView("audit")} className="h-7 text-xs rounded-md">View audit →</Button>
          </div>
          <div className="mt-3 max-h-[288px] overflow-y-auto scroll-thin pr-1">
            {stats.recentActivity.length === 0 ? (
              <EmptyPlaceholder
                icon={Clock3}
                title="No pipeline activity"
                description="Ingest a document to populate this trail. Scan, sanitize, and transformation events appear here."
                actionLabel="Go to ingest"
                onAction={() => setView("upload")}
              />
            ) : (
              <ol className="space-y-2">
                {stats.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2.5 hover:bg-muted/20 transition-colors">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="font-mono text-[11px] font-semibold tracking-wide">{a.action}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-muted-foreground text-xs">{a.actor}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground line-clamp-2">{a.detail}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">{formatRelativeTime(a.timestamp)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold tracking-tight">Classification</h3>
              <p className="text-xs text-muted-foreground">Auto-assigned by risk</p>
            </div>
            <Layers className="h-4 w-4 text-muted-foreground/50" />
          </div>
          <div className="mt-4 space-y-3.5">
            {stats.documentsByClassification.length === 0 ? (
              <EmptyPlaceholder
                icon={Layers}
                title="No documents classified"
                description="Ingest a document to see distribution across RESTRICTED → PUBLIC."
              />
            ) : (
              stats.documentsByClassification
                .sort((a, b) => rankClass(a.classification) - rankClass(b.classification))
                .map((c) => {
                  const total = stats.documentsByClassification.reduce((s, x) => s + x.count, 0);
                  const pct = total ? Math.round((c.count / total) * 100) : 0;
                  return (
                    <div key={c.classification}>
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono text-xs font-medium">{c.classification}</span>
                        <span className="font-mono text-xs tabular-nums text-muted-foreground">{c.count} · {pct}%</span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: classColor(c.classification) }} />
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </Card>
      </div>

      {!empty && (
        <p className="text-center text-[11px] text-muted-foreground">
          Showing genuine pipeline results — metrics update immediately after scan, sanitize, and validated transformation. Ingest another document to extend coverage.
        </p>
      )}
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
