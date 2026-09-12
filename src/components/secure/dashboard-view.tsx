"use client";

import { useEffect, useState } from "react";
import {
  FileStack, ShieldAlert, KeyRound, CheckCircle2, Activity, ArrowDownRight, Brain, Globe, Crosshair,
  Inbox, FileSearch, BarChart3, PieChart as PieIcon, Clock3, Layers,
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
    <Card className={cn("p-4", empty && "border-dashed bg-muted/20")}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={cn("mt-1 font-mono text-2xl font-semibold tabular-nums", empty && "text-muted-foreground font-normal")}>{value}</div>
          {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
        </div>
        <div
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg border",
            empty
              ? "bg-muted text-muted-foreground border-border border-dashed"
              : tone === "danger"
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
        <Button className="mt-3" onClick={() => setView("upload")}>Ingest document</Button>
      </Card>
    );
  }

  const empty = stats.totalDocuments === 0;

  return (
    <div className="space-y-4">
      {empty && (
        <Card className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-dashed bg-muted/20">
          <div className="flex gap-3">
            <div className="hidden sm:flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed bg-background">
              <Inbox className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <div className="text-sm font-semibold">Awaiting first document</div>
              <p className="mt-1 max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
                Ingest a document to collect information. Dashboard metrics, risk analysis, and intelligence will populate after you process a document through the full pipeline — scan, sanitize, then transform.
              </p>
            </div>
          </div>
          <Button onClick={() => setView("upload")} className="shrink-0">
            Ingest document
          </Button>
        </Card>
      )}

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={FileStack}
          label="Documents"
          value={empty ? "—" : stats.totalDocuments}
          hint={empty ? "Awaiting ingestion" : `${stats.scannedDocuments} scanned`}
          empty={empty}
        />
        <StatCard
          icon={ShieldAlert}
          label="High risk"
          value={empty ? "—" : stats.highRiskDocuments}
          hint={empty ? "Ingest to analyze risk" : `${stats.blockedDocuments} blocked`}
          tone={empty ? "default" : "danger"}
          empty={empty}
        />
        <StatCard
          icon={KeyRound}
          label="Secrets"
          value={empty ? "—" : stats.secretsBlocked}
          hint={empty ? "No detections yet" : `${stats.injectionBlocked} injections`}
          tone={empty ? "default" : "danger"}
          empty={empty}
        />
        <StatCard
          icon={CheckCircle2}
          label="Safe outputs"
          value={empty ? "—" : stats.safeOutputsReleased}
          hint={empty ? "Awaiting transformation" : "Passed DLP"}
          tone={empty ? "default" : "success"}
          empty={empty}
        />
        <StatCard
          icon={ArrowDownRight}
          label="Risk reduction"
          value={empty ? "—" : stats.avgRiskReduction > 0 ? `−${stats.avgRiskReduction}` : "0"}
          hint={empty ? "No analysis yet" : `${stats.piiDetected} PII findings`}
          tone={empty ? "default" : "success"}
          empty={empty}
        />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
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
          hint={empty ? "No indicators yet" : `${stats.totalTTPs ?? 0} TTPs`}
          empty={empty}
        />
        <StatCard
          icon={Crosshair}
          label="TTPs"
          value={empty ? "—" : stats.totalTTPs ?? 0}
          hint={empty ? "Awaiting analysis" : "MITRE ATT&CK"}
          empty={empty}
        />
        <Card className="p-4 border-primary/20 bg-primary/5">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pipeline</div>
          <div className="mt-1 text-sm font-semibold">Scan → Sanitize → Validate</div>
          <div className="mt-1 text-xs text-muted-foreground">Policy-aware protection</div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Risk reduction</h3>
              <p className="text-xs text-muted-foreground">Before vs after sanitization</p>
            </div>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="mt-4 h-64">
            {stats.riskTrend.length === 0 ? (
              <EmptyPlaceholder
                icon={BarChart3}
                title="No analysis yet"
                description="Ingest a document to generate before/after risk comparison. Risk is computed from detection findings and reduced via policy-driven sanitization."
                actionLabel={empty ? "Ingest document" : undefined}
                onAction={empty ? () => setView("upload") : undefined}
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.riskTrend} margin={{ top: 4, right: 8, left: -16, bottom: 0 }} barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 11, fontFamily: "var(--font-mono)" }} interval={0} stroke="var(--muted-foreground)" />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    cursor={{ fill: "var(--muted)", opacity: 0.3 }}
                    formatter={(value: any, name: any) => [value, name === "before" ? "Before" : "After"]}
                    labelFormatter={(_label, payload) => (payload?.[0]?.payload as any)?.title ?? _label}
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
          <p className="text-xs text-muted-foreground">All inputs</p>
          <div className="mt-4 h-64">
            {stats.findingsByCategory.length === 0 ? (
              <EmptyPlaceholder
                icon={PieIcon}
                title="No findings yet"
                description="Ingest a document to populate detection breakdown by category — PII, secrets, prompt injection and internal assets."
              />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.findingsByCategory} dataKey="count" nameKey="category" innerRadius={48} outerRadius={80} paddingAngle={2} stroke="var(--background)">
                    {stats.findingsByCategory.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
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
              <EmptyPlaceholder
                icon={Clock3}
                title="No pipeline activity"
                description="Ingest a document to collect information. Scan, sanitize, and transformation events will appear here after processing."
                actionLabel="Go to upload"
                onAction={() => setView("upload")}
              />
            ) : (
              <ol className="space-y-2">
                {stats.recentActivity.map((a) => (
                  <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border bg-card px-3 py-2">
                    <div className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono font-medium">{a.action}</span>
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
          <h3 className="text-sm font-semibold">Classification</h3>
          <p className="text-xs text-muted-foreground">Auto-assigned</p>
          <div className="mt-4 space-y-3">
            {stats.documentsByClassification.length === 0 ? (
              <EmptyPlaceholder
                icon={Layers}
                title="No documents classified"
                description="Ingest a document to see classification distribution — RESTRICTED, CONFIDENTIAL, INTERNAL, PUBLIC, UNCLASSIFIED."
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
                        <span className="font-mono">{c.classification}</span>
                        <span className="text-muted-foreground tabular-nums">{c.count} · {pct}%</span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
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
