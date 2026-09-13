"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, ShieldCheck, Sparkles, FileCheck2, RefreshCw,
  ScanLine, Wand2, AlertTriangle, CheckCircle2, XCircle, ScrollText, ChevronRight,
  Brain, Hash, Crosshair, ShieldAlert, Users, Globe, Info, ArrowRight, Eye, Lock,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useApp } from "@/lib/store";
import type {
  DocumentRecord, Finding, SecurityReport, TransformationRecord,
  AuditLogEntry, TransformationProfile, OutputType,
} from "@/types";
import { POLICY_LABELS, OUTPUT_LABELS } from "@/lib/security/policies";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ClassificationBadge, StatusBadge, ValidationBadge,
} from "@/components/secure/badges";
import { RiskGauge } from "@/components/secure/risk-gauge";
import { FindingsTable } from "@/components/secure/findings-table";
import { DiffView } from "@/components/secure/diff-view";
import { Stepper, type StepDef } from "@/components/secure/stepper";
import {
  riskColor, riskLabel, formatRelativeTime, formatBytes, CATEGORY_META,
} from "@/lib/display";
import { cn } from "@/lib/utils";

type Tab = "overview" | "findings" | "diff" | "transform" | "report" | "intelligence" | "history";

export function DocumentDetailView() {
  const { selectedDocumentId, setView, bumpRefresh } = useApp();
  const [doc, setDoc] = useState<DocumentRecord | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!selectedDocumentId) return;
    setLoading(true);
    try {
      const d = await api.getDocument(selectedDocumentId);
      setDoc(d);
    } catch (e: any) {
      toast.error("Failed to load document", { description: e.message });
    } finally {
      setLoading(false);
    }
  }, [selectedDocumentId]);

  useEffect(() => { reload(); }, [reload]);

  if (!selectedDocumentId) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">No document selected.</Card>;
  }

  if (loading || !doc) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const inputFindings = (doc.findings ?? []).filter((f) => f.stage === "INPUT");
  const outputFindings = (doc.findings ?? []).filter((f) => f.stage === "OUTPUT");

  async function runScan() {
    setBusy("scan");
    try {
      await api.scanDocument(doc!.id);
      toast.success("Re-scanned", { description: "Security findings refreshed." });
      await reload();
      bumpRefresh();
    } catch (e: any) {
      toast.error("Scan failed", { description: e.message });
    } finally { setBusy(null); }
  }

  async function runSanitize(policy: string) {
    setBusy("sanitize");
    try {
      const res = await api.sanitizeDocument(doc!.id, policy);
      if (res.blocked) {
        toast.error("Policy blocked transformation", { description: `${res.actions.length} block-level findings. Sanitization refused.` });
      } else {
        toast.success("Sanitized", { description: `Residual risk ${res.residualRisk}/100 · ${res.actions.length} actions applied.` });
      }
      await reload();
      bumpRefresh();
    } catch (e: any) {
      toast.error("Sanitization failed", { description: e.message });
    } finally { setBusy(null); }
  }

  async function runTransform(profile: TransformationProfile, outputType: OutputType) {
    setBusy("transform");
    try {
      const res = await api.transformDocument(doc!.id, profile, outputType);
      if (res.transformation.outputDlp === "FAIL") {
        toast.warning("Output released with repairs", { description: `${res.transformation.leakageCount} leakage candidate(s) auto-redacted.` });
      } else {
        toast.success("Transformation released", { description: `Output DLP passed · risk Δ ${res.transformation.riskDelta >= 0 ? "−" : "+"}${Math.abs(res.transformation.riskDelta)}` });
      }
      await reload();
      bumpRefresh();
    } catch (e: any) {
      toast.error("Transformation failed", { description: e.message });
    } finally { setBusy(null); }
  }

  const categoryCounts = inputFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.category] = (acc[f.category] ?? 0) + 1;
    return acc;
  }, {});

  const workflowSteps: StepDef[] = [
    { key: "overview", label: "Overview", desc: "Summary", status: "done" },
    {
      key: "findings",
      label: "Findings",
      desc: `${inputFindings.length} issues`,
      status: tab === "findings" ? "current" : inputFindings.length > 0 ? "done" : "upcoming",
    },
    {
      key: "diff",
      label: "Sanitize",
      desc: doc.sanitizedContent ? "Ready" : "Pending",
      status: doc.sanitizedContent ? "done" : tab === "diff" ? "current" : "upcoming",
    },
    {
      key: "transform",
      label: "Transform",
      desc: doc.transformations && doc.transformations.length > 0 ? "Ready" : "Pending",
      status: doc.transformations && doc.transformations.length > 0 ? "done" : tab === "transform" ? "current" : doc.status === "BLOCKED" ? "blocked" : "upcoming",
    },
  ];

  const riskValue = doc.status === "SANITIZED" || doc.status === "TRANSFORMED" ? doc.riskAfter ?? doc.riskScore : doc.riskBefore ?? doc.riskScore;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-xs">
        <Button variant="ghost" size="sm" onClick={() => setView("documents")} className="h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Documents
        </Button>
        <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
        <span className="font-medium tracking-tight truncate">{doc.title}</span>
        <span className="hidden sm:inline font-mono text-[11px] text-muted-foreground">· {doc.id.slice(0, 8)}</span>
      </div>

      <Card className="overflow-hidden">
        <div className="p-5 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-[18px] font-semibold tracking-tight leading-none">{doc.title}</h2>
                <ClassificationBadge value={doc.classification} />
                <StatusBadge status={doc.status} />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-[11px] leading-none text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />{doc.filename}</span>
                <span className="hidden sm:inline opacity-30">·</span>
                <span>{formatBytes(doc.sizeBytes)}</span>
                <span className="opacity-30">·</span>
                <span>{doc.metadata.wordCount ?? 0} words · {doc.metadata.pages ?? 1} pages</span>
                <span className="hidden md:inline opacity-30">·</span>
                <span className="hidden md:inline">SHA256 {doc.metadata.sha256?.slice(0, 12) ?? "—"}</span>
                <span className="opacity-30">·</span>
                <span>{formatRelativeTime(doc.createdAt)}</span>
              </div>
              <div className="mt-4">
                <Stepper steps={workflowSteps} onStepClick={(k) => setTab(k as Tab)} />
              </div>
            </div>
            <div className="flex items-start gap-5 shrink-0">
              <div className="flex flex-col items-center">
                <RiskGauge value={riskValue} before={doc.riskBefore} size={96} />
                <span className="mt-1.5 text-[11px] font-medium" style={{ color: riskColor(riskValue) }}>{riskLabel(riskValue)} · {riskValue}/100</span>
              </div>
              <div className="hidden sm:flex flex-col gap-2 min-w-[132px]">
                <Button variant="outline" size="sm" onClick={runScan} disabled={!!busy} className="h-8 gap-1.5 justify-start text-xs font-medium">
                  {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                  Re-scan
                </Button>
                <Button size="sm" onClick={() => setTab("diff")} disabled={!!busy} className="h-8 gap-1.5 justify-start text-xs font-medium">
                  <Wand2 className="h-3.5 w-3.5" /> Sanitize
                </Button>
                {doc.transformations && doc.transformations.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => setTab("transform")} className="h-8 gap-1.5 justify-start text-xs font-medium">
                    <Eye className="h-3.5 w-3.5" /> View output
                  </Button>
                )}
              </div>
            </div>
          </div>
          <div className="flex sm:hidden gap-2 mt-4">
            <Button variant="outline" size="sm" onClick={runScan} disabled={!!busy} className="flex-1 h-8 gap-1.5 text-xs">
              <ScanLine className="h-3.5 w-3.5" /> Re-scan
            </Button>
            <Button size="sm" onClick={() => setTab("diff")} disabled={!!busy} className="flex-1 h-8 gap-1.5 text-xs">
              <Wand2 className="h-3.5 w-3.5" /> Sanitize
            </Button>
          </div>
        </div>
        <div className="border-t border-border bg-muted/20 px-5 py-2.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-medium text-muted-foreground">Pipeline:</span>
          <span className="font-mono">Ingest → Scan → Sanitize → Transform → Validate</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Double-gate DLP</span>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
        <div className="border-b border-border bg-card rounded-t-xl px-1 -mb-px">
          <TabsList className="h-9 w-full justify-start gap-0 bg-transparent p-0 rounded-none">
            <TabsTrigger value="overview" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium"><ShieldCheck className="h-3.5 w-3.5" />Overview</TabsTrigger>
            <TabsTrigger value="findings" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium">
              <ScanLine className="h-3.5 w-3.5" />Findings
              <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-mono tabular-nums">{inputFindings.length}</span>
            </TabsTrigger>
            <TabsTrigger value="diff" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium"><Wand2 className="h-3.5 w-3.5" />Sanitize</TabsTrigger>
            <TabsTrigger value="transform" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium"><Sparkles className="h-3.5 w-3.5" />Transform</TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium"><FileCheck2 className="h-3.5 w-3.5" />Report</TabsTrigger>
            <TabsTrigger value="intelligence" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium"><Brain className="h-3.5 w-3.5" />Intel</TabsTrigger>
            <TabsTrigger value="history" className="gap-1.5 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 text-xs font-medium"><ScrollText className="h-3.5 w-3.5" />History</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab doc={doc} inputFindings={inputFindings} categoryCounts={categoryCounts} outputFindings={outputFindings} />
        </TabsContent>

        <TabsContent value="findings" className="mt-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Findings</h3>
                <p className="text-xs text-muted-foreground">{inputFindings.length} input · {outputFindings.length} output</p>
              </div>
              {inputFindings.length > 0 && !doc.sanitizedContent && (
                <Button size="sm" variant="outline" onClick={() => setTab("diff")} className="gap-1.5">Sanitize <ArrowRight className="h-3.5 w-3.5" /></Button>
              )}
            </div>
            <FindingsTable findings={inputFindings} emptyHint="No findings." />
          </Card>
        </TabsContent>

        <TabsContent value="diff" className="mt-4">
          <SanitizeTab doc={doc} busy={busy} onSanitize={runSanitize} />
        </TabsContent>

        {/* TRANSFORM */}
        <TabsContent value="transform" className="mt-4">
          <TransformTab doc={doc} busy={busy} onTransform={runTransform} />
        </TabsContent>

        {/* REPORT */}
        <TabsContent value="report" className="mt-4">
          <ReportTab documentId={doc.id} />
        </TabsContent>

        {/* INTELLIGENCE */}
        <TabsContent value="intelligence" className="mt-4">
          <IntelligenceTab documentId={doc.id} />
        </TabsContent>

        {/* HISTORY */}
        <TabsContent value="history" className="mt-4">
          <HistoryTab documentId={doc.id} transformations={doc.transformations ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ doc, inputFindings, categoryCounts, outputFindings }: {
  doc: DocumentRecord;
  inputFindings: Finding[];
  categoryCounts: Record<string, number>;
  outputFindings: Finding[];
}) {
  const severityCounts = inputFindings.reduce<Record<string, number>>((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {});
  const latestTx = doc.transformations?.[0];

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-5 lg:col-span-2">
        <h3 className="text-sm font-semibold">Summary</h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(["PII", "SECRET", "PROMPT_INJECTION", "INTERNAL_ASSET", "UNSAFE_URL"] as const).map((cat) => {
            const meta = CATEGORY_META[cat];
            const count = categoryCounts[cat] ?? 0;
            return (
              <div key={cat} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
                  {meta.label}
                </div>
                <div className="mt-1 font-mono text-2xl font-semibold tabular-nums" style={{ color: count > 0 ? meta.color : "var(--muted-foreground)" }}>
                  {count}
                </div>
              </div>
            );
          })}
          <div className="rounded-lg border border-border p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Output leakage</div>
            <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-[var(--risk-safe)]">
              {outputFindings.length + (latestTx?.leakageCount ?? 0)}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Severity</div>
          <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => {
              const count = severityCounts[sev] ?? 0;
              const total = inputFindings.length || 1;
              const pct = (count / total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={sev}
                  style={{
                    width: `${pct}%`,
                    backgroundColor: `var(--risk-${sev.toLowerCase()})`,
                  }}
                  title={`${sev}: ${count}`}
                />
              );
            })}
            {inputFindings.length === 0 && <div className="w-full bg-[var(--risk-safe)]/40" />}
          </div>
          <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
            {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const).map((sev) => (
              <span key={sev} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: `var(--risk-${sev.toLowerCase()})` }} />
                {sev} · {severityCounts[sev] ?? 0}
              </span>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Validation</h3>
        <p className="text-xs text-muted-foreground">Last transformation</p>
        <div className="mt-3 space-y-2.5">
          <GateRow icon={latestTx?.outputDlp === "PASS" ? CheckCircle2 : latestTx ? XCircle : AlertTriangle} label="Output DLP" status={latestTx?.outputDlp ?? "SKIPPED"} ok={latestTx?.outputDlp === "PASS"} />
          <GateRow icon={latestTx?.grounding === "PASS" ? CheckCircle2 : AlertTriangle} label="Grounding / citations" status={latestTx?.grounding ?? "SKIPPED"} ok={latestTx?.grounding === "PASS"} />
          <GateRow icon={latestTx?.policyStatus === "PASS" ? CheckCircle2 : AlertTriangle} label="Policy compliance" status={latestTx?.policyStatus ?? "SKIPPED"} ok={latestTx?.policyStatus === "PASS"} />
          {latestTx && (
            <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Risk delta</span>
                <span className="font-mono font-semibold text-[var(--risk-safe)]">
                  {latestTx.riskDelta >= 0 ? "−" : "+"}{Math.abs(latestTx.riskDelta)} pts
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-muted-foreground">Model</span>
                <span className="font-mono">{latestTx.model}</span>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function GateRow({ icon: Icon, label, status, ok }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  status: string;
  ok: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
      <div className="flex items-center gap-2">
        <Icon className={cn("h-4 w-4", ok ? "text-[var(--risk-safe)]" : status === "SKIPPED" ? "text-muted-foreground" : "text-[var(--risk-critical)]")} />
        <span className="text-sm">{label}</span>
      </div>
      <ValidationBadge status={status as any} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sanitize tab
// ---------------------------------------------------------------------------

function SanitizeTab({ doc, busy, onSanitize }: {
  doc: DocumentRecord;
  busy: string | null;
  onSanitize: (policy: string) => void;
}) {
  const [policy, setPolicy] = useState<string>(recommendPolicy(doc.classification));
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 sm:max-w-md flex-1">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Policy</Label>
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POLICY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Applied before model access.</p>
          </div>
          <Button onClick={() => onSanitize(policy)} disabled={!!busy} className="gap-1.5 shrink-0">
            {busy === "sanitize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Sanitize
          </Button>
        </div>
        {doc.status === "BLOCKED" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--risk-critical)]/30 bg-[var(--risk-critical)]/5 p-3 text-xs">
            <Lock className="h-4 w-4 shrink-0 text-[var(--risk-critical)]" />
            <span>Blocked by policy. Try a stricter policy or review findings.</span>
          </div>
        )}
      </Card>
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Before / After</h3>
          <span className="text-[11px] text-muted-foreground">{doc.sanitizedContent ? "Sanitized" : "Pending"}</span>
        </div>
        {doc.sanitizedContent ? (
          <DiffView before={doc.rawContent} after={doc.sanitizedContent} />
        ) : (
          <DiffView before={doc.rawContent} after={doc.rawContent} afterLabel="Awaiting sanitization" />
        )}
      </Card>
    </div>
  );
}

function recommendPolicy(classification: string): string {
  switch (classification) {
    case "RESTRICTED": return "SECURITY_INCIDENT";
    case "CONFIDENTIAL": return "EXECUTIVE_BRIEF";
    case "INTERNAL": return "INTERNAL_SUMMARY";
    case "PUBLIC": return "PUBLIC_RELEASE";
    default: return "PUBLIC_RELEASE";
  }
}

// ---------------------------------------------------------------------------
// Transform tab
// ---------------------------------------------------------------------------

function TransformTab({ doc, busy, onTransform }: {
  doc: DocumentRecord;
  busy: string | null;
  onTransform: (profile: TransformationProfile, outputType: OutputType) => void;
}) {
  const [profile, setProfile] = useState<TransformationProfile>(recommendProfile(doc.classification));
  const [outputType, setOutputType] = useState<OutputType>("EXECUTIVE_SUMMARY");
  const latest = doc.transformations?.[0];
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Profile</Label>
            <Select value={profile} onValueChange={(v) => setProfile(v as TransformationProfile)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POLICY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Output</Label>
            <Select value={outputType} onValueChange={(v) => setOutputType(v as OutputType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(OUTPUT_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={() => onTransform(profile, outputType)} disabled={!!busy || doc.status === "BLOCKED"} className="w-full gap-1.5">
              {busy === "transform" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Generate
            </Button>
          </div>
        </div>
        {doc.status === "BLOCKED" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--risk-critical)]/30 bg-[var(--risk-critical)]/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--risk-critical)]" />
            <span>Blocked by policy.</span>
          </div>
        )}
        {!doc.sanitizedContent && doc.status !== "BLOCKED" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--risk-medium)]" />
            <span>No sanitized copy. Will sanitize on transform.</span>
          </div>
        )}
      </Card>

      {latest && latest.outputContent && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Generated output</h3>
              <p className="text-xs text-muted-foreground">
                {OUTPUT_LABELS[latest.outputType]} · {POLICY_LABELS[latest.profile]} · {latest.model}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ValidationBadge status={latest.outputDlp} />
              <ValidationBadge status={latest.grounding} />
            </div>
          </div>
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 overflow-auto scroll-thin rounded-lg border border-border bg-muted/30 p-4 max-h-[28rem]">
              <pre className="m-0 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{latest.outputContent}</pre>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grounding citations</h4>
              <div className="max-h-[26rem] space-y-2 overflow-auto scroll-thin">
                {latest.citations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No citable claims detected.</p>
                ) : (
                  latest.citations.map((c, i) => (
                    <div key={i} className={cn(
                      "rounded-lg border p-2.5 text-xs",
                      c.grounded ? "border-[var(--risk-safe)]/30 bg-[var(--risk-safe)]/5" : "border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/5"
                    )}>
                      <div className="flex items-center gap-1.5">
                        {c.grounded ? <CheckCircle2 className="h-3 w-3 text-[var(--risk-safe)]" /> : <AlertTriangle className="h-3 w-3 text-[var(--risk-medium)]" />}
                        <span className="font-mono text-[10px] uppercase">{c.grounded ? "Grounded" : "Unsupported"}</span>
                      </div>
                      <p className="mt-1 text-foreground/80 line-clamp-3">{c.claim}</p>
                      {c.evidence !== "none" && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{c.evidence}</p>}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function recommendProfile(classification: string): TransformationProfile {
  switch (classification) {
    case "RESTRICTED": return "SECURITY_INCIDENT";
    case "CONFIDENTIAL": return "EXECUTIVE_BRIEF";
    case "INTERNAL": return "INTERNAL_SUMMARY";
    default: return "PUBLIC_RELEASE";
  }
}

// ---------------------------------------------------------------------------
// Report tab
// ---------------------------------------------------------------------------

function ReportTab({ documentId }: { documentId: string }) {
  const [report, setReport] = useState<SecurityReport | null>(null);
  const [riskBreakdown, setRiskBreakdown] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getSecurityReport(documentId)
      .then((r) => { if (active) { setReport(r.report); setRiskBreakdown(r.riskBreakdown); } })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [documentId]);

  if (loading || !report) {
    return <Card className="p-5"><Skeleton className="h-64 rounded-lg" /></Card>;
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Security report</h3>
            <p className="text-xs text-muted-foreground">Generated {formatRelativeTime(report.generatedAt)}</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => printReport(report)} className="gap-1.5">
            <FileCheck2 className="h-3.5 w-3.5" /> Print
          </Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          <ReportStat label="Risk score" value={`${report.riskScore}`} tone={riskColor(report.riskScore)} />
          <ReportStat label="Classification" value={report.classification} small />
          <ReportStat label="PII" value={report.findings.pii} tone="var(--chart-1)" />
          <ReportStat label="Secrets" value={report.findings.secrets} tone="var(--chart-3)" />
          <ReportStat label="Injection" value={report.findings.promptInjection} tone="var(--chart-5)" />
          <ReportStat label="Output leak" value={report.findings.outputLeakage} tone="var(--risk-safe)" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Risk breakdown</h3>
          <p className="text-xs text-muted-foreground">Weighted contribution by category</p>
          {riskBreakdown && (
            <div className="mt-3 space-y-2.5">
              {([
                ["PII", riskBreakdown.pii, "var(--chart-1)"],
                ["Secrets", riskBreakdown.secrets, "var(--chart-3)"],
                ["Prompt injection", riskBreakdown.promptInjection, "var(--chart-5)"],
                ["Internal assets", riskBreakdown.internalAssets, "var(--chart-2)"],
                ["Unsafe URLs", riskBreakdown.unsafeUrls, "var(--chart-4)"],
              ] as const).map(([label, val, color]) => {
                const max = Math.max(riskBreakdown.total, 1, 1);
                const pct = Math.min(100, (val / max) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs">
                      <span>{label}</span>
                      <span className="font-mono tabular-nums" style={{ color }}>{val}</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h3 className="text-sm font-semibold">Top findings</h3>
          <p className="text-xs text-muted-foreground">Highest-confidence detections</p>
          <div className="mt-3 space-y-2">
            {report.topFindings.length === 0 ? (
              <p className="text-xs text-muted-foreground">No findings.</p>
            ) : (
              report.topFindings.map((f) => (
                <div key={f.id} className="flex items-start gap-2 rounded-lg border border-border p-2.5">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: CATEGORY_META[f.category].color }} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium">{f.type.replace(/_/g, " ")}</span>
                      <span className="font-mono text-[10px] text-muted-foreground">{Math.round(f.confidence * 100)}%</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2">{f.reason}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Sanitized preview</h3>
        <p className="text-xs text-muted-foreground">First 600 characters of the working copy sent to the model</p>
        <pre className="mt-3 max-h-64 overflow-auto scroll-thin whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
          {report.sanitizedPreview}
        </pre>
      </Card>
    </div>
  );
}

function ReportStat({ label, value, tone, small }: { label: string; value: string | number; tone?: string; small?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("mt-1 font-mono font-semibold tabular-nums", small ? "text-sm" : "text-xl")} style={tone ? { color: tone } : undefined}>
        {value}
      </div>
    </div>
  );
}

function printReport(report: SecurityReport) {
  const lines = [
    "SecureContent AI — Security Report",
    "====================================",
    `Generated: ${new Date(report.generatedAt).toLocaleString()}`,
    "",
    `Risk Score:       ${report.riskScore}/100`,
    `Classification:   ${report.classification}`,
    `PII Findings:     ${report.findings.pii}`,
    `Secret Findings:  ${report.findings.secrets}`,
    `Injection:        ${report.findings.promptInjection}`,
    `Internal Assets:  ${report.findings.internalAssets}`,
    `Unsafe URLs:      ${report.findings.unsafeUrls}`,
    `Output Leakage:   ${report.findings.outputLeakage}`,
    `Grounding:        ${report.grounding}`,
    `Policy Status:    ${report.policyStatus}`,
    `Output DLP:       ${report.outputDlp}`,
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `security-report-${report.documentId}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Intelligence tab (signature innovation #2)
// ---------------------------------------------------------------------------

function IntelligenceTab({ documentId }: { documentId: string }) {
  const [data, setData] = useState<import("@/types").IntelligenceReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.getIntelligence(documentId)
      .then((r) => active && setData(r))
      .catch((e) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [documentId]);

  if (loading) return <Card className="p-5"><Skeleton className="h-64 rounded-lg" /></Card>;
  if (error) return <Card className="p-5 text-sm text-red-600">Failed to load intelligence: {error}</Card>;
  if (!data) return <Card className="p-5 text-sm text-muted-foreground">No intelligence report.</Card>;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Intelligence summary</h3>
          <span className="ml-auto text-[11px] rounded border bg-muted px-2 py-0.5 font-mono">{data.classification} · {data.model}</span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground bg-muted/40 rounded-md p-3 border">{data.summary}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5 text-center">
          <div className="rounded border bg-muted/30 p-2"><div className="text-[10px] text-muted-foreground uppercase">Entities</div><div className="font-mono text-lg font-bold">{data.counts.entities}</div></div>
          <div className="rounded border bg-muted/30 p-2"><div className="text-[10px] text-muted-foreground uppercase">IOCs</div><div className="font-mono text-lg font-bold">{data.counts.iocs}</div></div>
          <div className="rounded border bg-muted/30 p-2"><div className="text-[10px] text-muted-foreground uppercase">TTPs</div><div className="font-mono text-lg font-bold">{data.counts.ttps}</div></div>
          <div className="rounded border bg-muted/30 p-2"><div className="text-[10px] text-muted-foreground uppercase">Risks</div><div className="font-mono text-lg font-bold">{data.counts.risks}</div></div>
          <div className="rounded border bg-muted/30 p-2"><div className="text-[10px] text-muted-foreground uppercase">Findings</div><div className="font-mono text-lg font-bold">{data.counts.keyFindings}</div></div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Entities</div>
          <div className="space-y-1 max-h-64 overflow-auto pr-1">
            {data.entities.slice(0, 12).map((e, i) => (
              <div key={i} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                <span className="text-xs font-mono truncate">{e.value}</span>
                <span className="ml-2 shrink-0 rounded border bg-card px-1.5 py-0.5 text-[10px]">{e.type}</span>
              </div>
            ))}
            {!data.entities.length && <span className="text-xs text-muted-foreground">No entities.</span>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Globe className="h-3.5 w-3.5" /> IOCs</div>
          <div className="space-y-1 max-h-64 overflow-auto pr-1">
            {data.iocs.slice(0, 12).map((i, idx) => (
              <div key={idx} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                <span className="text-xs font-mono truncate">{i.value}</span>
                <span className="ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px]">{i.type}</span>
              </div>
            ))}
            {!data.iocs.length && <span className="text-xs text-muted-foreground">No IOCs.</span>}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Crosshair className="h-3.5 w-3.5" /> TTPs — MITRE ATT&CK</div>
        {data.ttps.length ? (
          <div className="space-y-2">
            {data.ttps.map((t, i) => (
              <div key={i} className="rounded-md border bg-card p-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-mono">{t.mitreId}</span>
                  <span className="text-xs font-semibold">{t.technique}</span>
                  <span className="rounded border bg-muted px-1.5 py-0.5 text-[10px]">{t.tactic}</span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{t.evidence}</div>
              </div>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">No TTPs mapped.</span>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5" /> Risks</div>
          <div className="space-y-1.5">
            {data.risks.map((r, i) => (
              <div key={i} className="rounded border bg-muted/30 p-2.5">
                <div className="text-xs font-semibold">{r.category} · <span className="font-mono text-[10px]">{r.severity}</span></div>
                <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>
              </div>
            ))}
            {!data.risks.length && <span className="text-xs text-muted-foreground">No risks synthesized.</span>}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Hash className="h-3.5 w-3.5" /> Key Findings</div>
          <div className="space-y-2">
            {data.keyFindings.map((kf, i) => (
              <div key={i} className="rounded border bg-card p-2.5">
                <div className="text-xs">{kf.finding}</div>
                <div className="mt-1 font-mono text-[11px] text-muted-foreground">{kf.evidence}</div>
              </div>
            ))}
            {!data.keyFindings.length && <span className="text-xs text-muted-foreground">No key findings.</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({ documentId, transformations }: {
  documentId: string;
  transformations: TransformationRecord[];
}) {
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api.getHistory(documentId)
      .then((r) => active && setAudit(r.audit))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [documentId]);

  return (
    <div className="space-y-4">
      {transformations.length > 0 && (
        <Card className="p-5">
          <h3 className="text-sm font-semibold">Transformation history</h3>
          <div className="mt-3 space-y-2">
            {transformations.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-border p-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-medium">{OUTPUT_LABELS[t.outputType]}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{POLICY_LABELS[t.profile]}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="font-mono text-[10px]">{t.model}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {formatRelativeTime(t.createdAt)} · risk Δ {t.riskDelta >= 0 ? "−" : "+"}{Math.abs(t.riskDelta)} · {t.leakageCount} leakage
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <ValidationBadge status={t.outputDlp} />
                  <ValidationBadge status={t.grounding} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h3 className="text-sm font-semibold">Audit trail</h3>
        <p className="text-xs text-muted-foreground">Every security decision for this document</p>
        {loading ? (
          <div className="mt-3 space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : (
          <ol className="mt-3 space-y-2">
            {audit.map((a) => (
              <li key={a.id} className="flex items-start gap-3 rounded-lg border border-border px-3 py-2">
                <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted font-mono text-[10px] uppercase text-muted-foreground">
                  {a.actor.slice(0, 2)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="font-mono font-medium">{a.action}</span>
                    <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    <span className="text-muted-foreground">{a.actor}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{a.detail}</p>
                </div>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {new Date(a.timestamp).toLocaleTimeString()}
                </span>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
