"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, ShieldCheck, Sparkles, FileCheck2,
  ScanLine, Wand2, AlertTriangle, CheckCircle2, XCircle, ScrollText, ChevronRight,
  Brain, Hash, Crosshair, ShieldAlert, Users, Globe, ArrowRight, Eye, Lock,
  Copy, Check, Download,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { useApp } from "@/lib/store";
import type {
  DocumentRecord, Finding, SecurityReport, TransformationRecord,
  AuditLogEntry, TransformationProfile, OutputType, PolicyRule,
  FindingActionOverride, ScanConfig, SanitizeAction,
} from "@/types";
import { POLICY_LABELS, OUTPUT_LABELS, policyDisplayName } from "@/lib/security/policies";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
  riskColor, formatRelativeTime, formatBytes, CATEGORY_META,
} from "@/lib/display";
import { sanitizeForDisplay } from "@/lib/text";
import { cn } from "@/lib/utils";
import { HelpButton } from "@/components/secure/help-button";

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

  async function runScan(config?: ScanConfig) {
    setBusy("scan");
    try {
      await api.scanDocument(doc!.id, config);
      toast.success("Re-scanned", { description: config ? "Security findings refreshed with your scan options." : "Security findings refreshed." });
      await reload();
      bumpRefresh();
    } catch (e: any) {
      toast.error("Scan failed", { description: e.message });
    } finally { setBusy(null); }
  }

  async function runSanitize(policy: string, findingActions?: FindingActionOverride[]) {
    setBusy("sanitize");
    try {
      const res = await api.sanitizeDocument(doc!.id, policy, findingActions);
      const overridden = findingActions?.length ?? 0;
      if (res.blocked) {
        toast.error("Policy blocked transformation", { description: `${res.actions.length} block-level findings. Sanitization refused.` });
      } else {
        toast.success("Sanitized", { description: `Residual risk ${res.residualRisk}/100 · ${res.actions.length} actions applied${overridden ? ` (${overridden} your choices)` : ""}.` });
      }
      await reload();
      bumpRefresh();
    } catch (e: any) {
      toast.error("Sanitization failed", { description: e.message });
    } finally { setBusy(null); }
  }

  async function runTransform(
    profile: TransformationProfile,
    outputType: OutputType,
    params?: { tone?: string; language?: string; detailLevel?: string; objective?: string; style?: string }
  ) {
    setBusy("transform");
    const prevCount = doc!.transformations?.length ?? 0;
    try {
      const res = await api.transformDocument(doc!.id, profile, outputType, params as any);
      const tx = res.transformation ?? res.transformations?.[0];
      if (!tx) throw new Error("No transformation returned");
      if (tx.outputDlp === "FAIL") {
        toast.warning("Output released with repairs", { description: `${tx.leakageCount} leakage candidate(s) auto-redacted.` });
      } else {
        toast.success("Transformation released", { description: `${tx.outputType} · DLP passed · risk Δ ${tx.riskDelta >= 0 ? "−" : "+"}${Math.abs(tx.riskDelta)}` });
      }
      await reload();
      bumpRefresh();
    } catch (e: any) {
      // The server often still completes the transform after a client-side timeout
      // (LLM latency). Reload and check before reporting failure.
      try {
        const fresh = await api.getDocument(doc!.id);
        setDoc(fresh);
        bumpRefresh();
        if ((fresh.transformations?.length ?? 0) > prevCount) {
          const tx = fresh.transformations?.[0];
          toast.success("Transformation released", {
            description: tx ? `${tx.outputType} · completed (recovered after timeout)` : "Completed — reloaded latest output.",
          });
          return;
        }
      } catch {
        // fall through to error toast
      }
      toast.error("Transformation failed", { description: e.message });
    } finally { setBusy(null); }
  }

  async function runBatchTransform(
    profile: TransformationProfile,
    outputTypes: OutputType[],
    params?: { tone?: string; language?: string; detailLevel?: string; objective?: string; style?: string }
  ) {
    if (!outputTypes.length) {
      toast.error("Select at least one output type");
      return;
    }
    setBusy("transform");
    const prevCount = doc!.transformations?.length ?? 0;
    try {
      const res = outputTypes.length === 1
        ? await api.transformDocument(doc!.id, profile, outputTypes[0], params as any)
        : await api.transformBatch(doc!.id, { profile, outputTypes, ...(params as any) });
      const count = (res as any).transformations?.length ?? 1;
      const itemErrors = (res as any).errors as { outputType: string; error: string }[] | undefined;
      if (itemErrors?.length) {
        toast.warning(`Generated ${count} of ${outputTypes.length} artefacts`, { description: `${itemErrors.map((e) => e.outputType).join(", ")} failed — retry those types.` });
      } else {
        toast.success(`Generated ${count} artefact${count > 1 ? "s" : ""}`, { description: `${outputTypes.join(", ")} via ${profile}` });
      }
      await reload();
      bumpRefresh();
    } catch (e: any) {
      try {
        const fresh = await api.getDocument(doc!.id);
        setDoc(fresh);
        bumpRefresh();
        if ((fresh.transformations?.length ?? 0) > prevCount) {
          toast.success("Transformation released", { description: "Completed — reloaded latest output (recovered after timeout)." });
          return;
        }
      } catch {
        // fall through to error toast
      }
      toast.error("Batch transformation failed", { description: e.message });
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
      <div className="flex items-center gap-2 text-xs min-w-0">
        <Button variant="ghost" size="sm" onClick={() => setView("documents")} className="h-7 gap-1 px-2 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0">
          <ArrowLeft className="h-3.5 w-3.5" /> Documents
        </Button>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" />
        <span className="font-medium tracking-tight truncate min-w-0" title={doc.title}>{doc.title}</span>
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
              <div className="flex flex-col items-center shrink-0 pt-1">
                <RiskGauge value={riskValue} before={doc.riskBefore} size={104} />
              </div>
              <div className="hidden sm:flex flex-col gap-2 min-w-[132px]">
                <Button variant="outline" size="sm" onClick={() => runScan()} disabled={!!busy} className="h-8 gap-1.5 justify-start text-xs font-medium">
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
            <Button variant="outline" size="sm" onClick={() => runScan()} disabled={!!busy} className="flex-1 h-8 gap-1.5 text-xs">
              <ScanLine className="h-3.5 w-3.5" /> Re-scan
            </Button>
            <Button size="sm" onClick={() => setTab("diff")} disabled={!!busy} className="flex-1 h-8 gap-1.5 text-xs">
              <Wand2 className="h-3.5 w-3.5" /> Sanitize
            </Button>
            {doc.transformations && doc.transformations.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setTab("transform")} className="flex-1 h-8 gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" /> Output
              </Button>
            )}
          </div>
        </div>
        <div className="border-t border-border bg-muted/20 px-5 py-2.5 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-medium text-muted-foreground">Pipeline:</span>
          <span className="font-mono">Ingest → Scan → Sanitize → Transform → Validate</span>
          <span className="ml-auto hidden sm:inline-flex items-center gap-1.5 text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Double-gate DLP</span>
        </div>
      </Card>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="w-full">
        <div className="border-b border-border bg-card rounded-t-xl px-1 -mb-px overflow-x-auto scroll-thin">
          <TabsList className="h-9 w-max min-w-full justify-start gap-0 bg-transparent p-0 rounded-none">
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
          <FindingsPanel
            doc={doc}
            inputFindings={inputFindings}
            outputFindings={outputFindings}
            busy={busy}
            onSanitize={(policy, actions) => runSanitize(policy, actions)}
            onScan={(config) => runScan(config)}
            onJumpSanitize={() => setTab("diff")}
          />
        </TabsContent>

        <TabsContent value="diff" className="mt-4">
          <SanitizeTab doc={doc} busy={busy} onSanitize={runSanitize} />
        </TabsContent>

        {/* TRANSFORM */}
        <TabsContent value="transform" className="mt-4">
          <TransformTab doc={doc} busy={busy} onTransform={runTransform} onBatch={runBatchTransform} />
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
                <span className={`font-mono font-semibold ${latestTx.riskDelta >= 0 ? "text-[var(--risk-safe)]" : "text-[var(--risk-critical)]"}`}>
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
// Findings tab — review every detection, override its handling, tune scanning
// ---------------------------------------------------------------------------

const SCAN_FAMILIES: { key: keyof ScanConfig; label: string; hint: string }[] = [
  { key: "pii", label: "Personal data", hint: "Emails, phones, IDs, addresses, payment data" },
  { key: "secrets", label: "Secrets", hint: "API keys, tokens, private keys, connection strings" },
  { key: "injections", label: "Prompt injection", hint: "Override phrases, role tricks, hidden directives" },
  { key: "internalAssets", label: "Internal assets", hint: "Internal IPs, hosts, project names" },
  { key: "unsafeUrls", label: "Unsafe URLs", hint: "javascript:, data:, file: schemes" },
];

function FindingsPanel({ doc, inputFindings, outputFindings, busy, onSanitize, onScan, onJumpSanitize }: {
  doc: DocumentRecord;
  inputFindings: Finding[];
  outputFindings: Finding[];
  busy: string | null;
  onSanitize: (policy: string, actions?: FindingActionOverride[]) => void;
  onScan: (config: ScanConfig) => void;
  onJumpSanitize: () => void;
}) {
  const [overrides, setOverrides] = useState<Record<string, SanitizeAction>>({});
  const [policy, setPolicy] = useState<string>(recommendPolicy(doc.classification));
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const storedConfig = ((doc.metadata ?? {}) as { scanConfig?: ScanConfig }).scanConfig;
  const [draft, setDraft] = useState<ScanConfig>({
    pii: storedConfig?.pii ?? true,
    secrets: storedConfig?.secrets ?? true,
    injections: storedConfig?.injections ?? true,
    internalAssets: storedConfig?.internalAssets ?? true,
    unsafeUrls: storedConfig?.unsafeUrls ?? true,
    minConfidence: storedConfig?.minConfidence ?? 0,
  });

  useEffect(() => {
    api.getPolicies().then((ps) => setPolicies(ps.filter((p) => p.active))).catch(() => setPolicies(null));
  }, []);
  useEffect(() => { setOverrides({}); }, [doc.id]);

  const byId = useMemo(() => new Map(inputFindings.map((f) => [f.id, f])), [inputFindings]);
  const changed = Object.entries(overrides).filter(([id, a]) => byId.get(id) && byId.get(id)!.action !== a);
  const scanSummary = storedConfig
    ? SCAN_FAMILIES.filter((f) => storedConfig[f.key]).map((f) => f.label).join(" · ")
    : "Full scan";

  function applyOverrides() {
    onSanitize(
      policy,
      changed.map(([id, action]) => ({ id, action }))
    );
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="mr-auto min-w-0">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            Findings
            <HelpButton title="Choosing what to keep">
              Every detection starts with the policy's action, but you can overrule any row — keep a span, mask it, redact it, or quarantine it — then sanitize with your choices. Credentials can never be kept and injections always stay quarantined: those options are locked for platform safety.
            </HelpButton>
          </h3>
          <p className="text-xs text-muted-foreground">{inputFindings.length} input · {outputFindings.length} output · scan: {scanSummary}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { setDraft({ pii: storedConfig?.pii ?? true, secrets: storedConfig?.secrets ?? true, injections: storedConfig?.injections ?? true, internalAssets: storedConfig?.internalAssets ?? true, unsafeUrls: storedConfig?.unsafeUrls ?? true, minConfidence: storedConfig?.minConfidence ?? 0 }); setScanOpen(true); }} className="h-8 gap-1.5 text-xs">
          <ScanLine className="h-3.5 w-3.5" /> Scan options
        </Button>
        {inputFindings.length > 0 && !doc.sanitizedContent && changed.length === 0 && (
          <Button size="sm" variant="outline" onClick={onJumpSanitize} className="h-8 gap-1.5 text-xs">Sanitize <ArrowRight className="h-3.5 w-3.5" /></Button>
        )}
      </div>

      {changed.length > 0 && (
        <div className="mb-3 flex flex-col gap-2 rounded-lg border border-primary/25 bg-primary/5 p-3 sm:flex-row sm:items-center">
          <p className="text-xs flex-1">
            <span className="font-semibold">{changed.length} custom choice{changed.length !== 1 ? "s" : ""}</span>
            <span className="text-muted-foreground"> — applied on top of the policy at sanitize time and recorded in the audit trail.</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger className="h-8 w-full text-xs min-[480px]:w-[168px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(policies ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.name}>{policyDisplayName(p.name)}</SelectItem>
                ))}
                {policies && !policies.some((p) => p.name === policy) && (
                  <SelectItem value={policy}>{policyDisplayName(policy)}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setOverrides({})}>Reset</Button>
            <Button size="sm" className="h-8 text-xs gap-1.5 max-w-full" disabled={!!busy} onClick={applyOverrides}>
              {busy === "sanitize" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
              Sanitize with my choices
            </Button>
          </div>
        </div>
      )}

      <FindingsTable
        findings={inputFindings}
        emptyHint="No findings — nothing detected under the current scan options."
        overrideActions={overrides}
        onOverrideAction={(id, action) => setOverrides((prev) => ({ ...prev, [id]: action }))}
      />

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent className="max-w-md sm:max-w-md">
          <DialogHeader><DialogTitle className="text-sm tracking-tight">Scan options</DialogTitle></DialogHeader>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Choose which detector families run on this document. Output DLP always scans everything regardless — first-pass scanning is the only thing being tuned.
          </p>
          <div className="space-y-2.5">
            {SCAN_FAMILIES.map((f) => (
              <div key={f.key} className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <Switch
                  checked={draft[f.key] as boolean}
                  onCheckedChange={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
                  aria-label={f.label}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium">{f.label}</div>
                  <div className="text-[11px] text-muted-foreground">{f.hint}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium flex items-center gap-1.5">
                  Minimum confidence
                  <HelpButton title="Confidence floor">Detections below this confidence are dropped before sanitization. Raise it to reduce noise; lower it to catch more edge cases.</HelpButton>
                </div>
                <div className="text-[11px] text-muted-foreground">Drop findings below this confidence</div>
              </div>
              <Select value={String(draft.minConfidence ?? 0)} onValueChange={(v) => setDraft((d) => ({ ...d, minConfidence: Number(v) }))}>
                <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">Any (0%)</SelectItem>
                  <SelectItem value="0.5">Low (50%)</SelectItem>
                  <SelectItem value="0.7">Medium (70%)</SelectItem>
                  <SelectItem value="0.9">High (90%)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setScanOpen(false)}>Cancel</Button>
            <Button size="sm" disabled={!!busy} onClick={() => { setScanOpen(false); onScan(draft); }} className="gap-1.5">
              {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
              Re-scan with these options
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
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
  const [policies, setPolicies] = useState<PolicyRule[] | null>(null);
  useEffect(() => {
    api.getPolicies().then((ps) => setPolicies(ps.filter((p) => p.active))).catch(() => setPolicies(null));
  }, []);
  const options = policies ?? Object.entries(POLICY_LABELS).map(([name, label]) => ({ id: name, name, description: label }));
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2 sm:max-w-md flex-1 min-w-0">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              Policy
              <HelpButton title="Choosing a policy">
                The policy decides what happens to each finding before the model sees anything: masked spans are partially hidden, removed spans fully redacted, blocked secrets force-removed, and injection spans quarantined. Pick the profile matching your audience — including your own custom policies.
              </HelpButton>
            </Label>
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger className="h-9 w-full max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {options.map((p) => (
                  <SelectItem key={p.id ?? p.name} value={p.name}>{policies ? policyDisplayName(p.name) : p.description}</SelectItem>
                ))}
                {policies && !policies.some((p) => p.name === policy) && (
                  <SelectItem value={policy}>{policyDisplayName(policy)}</SelectItem>
                )}
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

function TransformTab({ doc, busy, onTransform, onBatch }: {
  doc: DocumentRecord;
  busy: string | null;
  onTransform: (profile: TransformationProfile, outputType: OutputType, params?: Record<string, string>) => void;
  onBatch?: (profile: TransformationProfile, outputTypes: OutputType[], params?: Record<string, string>) => void;
}) {
  const [profile, setProfile] = useState<string>(recommendProfile(doc.classification));
  const [tone, setTone] = useState<string>("professional");
  const [language, setLanguage] = useState<string>("en");
  const [detailLevel, setDetailLevel] = useState<string>("standard");
  const [objective, setObjective] = useState<string>("inform");
  const [style, setStyle] = useState<string>("structured");
  const [selectedTypes, setSelectedTypes] = useState<OutputType[]>(["EXECUTIVE_SUMMARY"]);
  const [viewTxId, setViewTxId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [txPolicies, setTxPolicies] = useState<PolicyRule[] | null>(null);
  useEffect(() => {
    api.getPolicies().then((ps) => setTxPolicies(ps.filter((p) => p.active))).catch(() => setTxPolicies(null));
  }, []);
  const transformations = doc.transformations ?? [];
  const activeTx = viewTxId ? transformations.find((t) => t.id === viewTxId) ?? transformations[0] : transformations[0];

  useEffect(() => { setCopied(false); }, [activeTx?.id]);

  async function handleCopyOutput() {
    if (!activeTx?.outputContent) return;
    try {
      await navigator.clipboard.writeText(activeTx.outputContent);
    } catch {
      // Fallback for non-secure contexts where the async Clipboard API is unavailable
      const ta = document.createElement("textarea");
      ta.value = activeTx.outputContent;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    toast.success("Copied to clipboard", { description: `${OUTPUT_LABELS[activeTx.outputType]} ready to paste.` });
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownloadOutput() {
    if (!activeTx?.outputContent) return;
    const safe = doc.title.replace(/[^\w\-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "output";
    const blob = new Blob([activeTx.outputContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}-${activeTx.outputType.toLowerCase().replace(/_/g, "-")}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Download started", { description: a.download });
  }

  const toggleType = (t: OutputType) => {
    setSelectedTypes((prev) => prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 8));
  };

  const handleSingleGenerate = () => {
    const primary = selectedTypes[0] ?? "EXECUTIVE_SUMMARY";
    // Custom policy names are validated server-side; the cast keeps the built-in type surface.
    if (selectedTypes.length > 1 && onBatch) onBatch(profile as TransformationProfile, selectedTypes, { tone, language, detailLevel, objective, style });
    else onTransform(profile as TransformationProfile, primary, { tone, language, detailLevel, objective, style });
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold tracking-tight flex items-center gap-1.5">
              <Sparkles className="h-4 w-4 text-primary" /> Configurable Transformation
              <HelpButton title="Generation controls">
                Source is always the sanitized working copy — never raw content. Tune audience, tone, language, detail, objective, and style per artefact. You can batch up to 8 outputs at once; each is validated independently before delivery.
              </HelpButton>
            </h3>
            <p className="text-xs text-muted-foreground">Select deliverable(s) and fine-tune generation. Source is the sanitized copy only.</p>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded-full border bg-muted px-2 py-1">{selectedTypes.length} artefact{selectedTypes.length !== 1 ? "s" : ""} selected</span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Target Audience (Profile)</Label>
            <Select value={profile} onValueChange={setProfile}>
              <SelectTrigger className="h-9 w-full max-w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(txPolicies ?? Object.entries(POLICY_LABELS).map(([name, description]) => ({ id: name, name }))).map((p: any) => (
                  <SelectItem key={p.id ?? p.name} value={p.name}>{txPolicies ? policyDisplayName(p.name) : POLICY_LABELS[p.name]}</SelectItem>
                ))}
                {txPolicies && !txPolicies.some((p) => p.name === profile) && (
                  <SelectItem value={profile}>{policyDisplayName(profile)}</SelectItem>
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Controls allow/mask/remove/block before model access.</p>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="technical">Technical</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="persuasive">Persuasive</SelectItem>
                <SelectItem value="neutral">Neutral</SelectItem>
                <SelectItem value="concise">Concise</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Language</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
                <SelectItem value="de">Deutsch</SelectItem>
                <SelectItem value="ja">日本語</SelectItem>
                <SelectItem value="zh">中文</SelectItem>
                <SelectItem value="hi">हिन्दी</SelectItem>
                <SelectItem value="pt">Português</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3 mt-4">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Level of Detail</Label>
            <Select value={detailLevel} onValueChange={setDetailLevel}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="brief">Brief</SelectItem>
                <SelectItem value="standard">Standard</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
                <SelectItem value="comprehensive">Comprehensive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Communication Objective</Label>
            <Select value={objective} onValueChange={setObjective}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="inform">Inform</SelectItem>
                <SelectItem value="summarize">Summarize</SelectItem>
                <SelectItem value="persuade">Persuade</SelectItem>
                <SelectItem value="educate">Educate</SelectItem>
                <SelectItem value="announce">Announce</SelectItem>
                <SelectItem value="report">Report</SelectItem>
                <SelectItem value="analyze">Analyze</SelectItem>
                <SelectItem value="comply">Comply</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Content Style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="narrative">Narrative</SelectItem>
                <SelectItem value="bullet">Bullet Points</SelectItem>
                <SelectItem value="structured">Structured</SelectItem>
                <SelectItem value="conversational">Conversational</SelectItem>
                <SelectItem value="formal">Formal Document</SelectItem>
                <SelectItem value="executive">Executive</SelectItem>
                <SelectItem value="creative">Creative</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-5">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Output Type(s) — select one or more deliverables</Label>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(OUTPUT_LABELS).map(([k, v]) => {
              const checked = selectedTypes.includes(k as OutputType);
              return (
                <label key={k} className={`flex items-center gap-2 rounded-lg border p-2.5 cursor-pointer transition-colors ${checked ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-muted/50"}`}>
                  <input type="checkbox" checked={checked} onChange={() => toggleType(k as OutputType)} className="h-4 w-4 rounded border-input accent-primary" />
                  <span className="text-xs font-medium">{v}</span>
                </label>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">You can generate up to 8 artefacts in one batch. Each is produced via the security pipeline independently.</p>
        </div>

        <div className="mt-5 flex gap-2">
          <Button onClick={handleSingleGenerate} disabled={!!busy || doc.status === "BLOCKED" || !selectedTypes.length} className="flex-1 gap-1.5">
            {busy === "transform" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {selectedTypes.length > 1 ? `Generate ${selectedTypes.length} artefacts` : "Generate artefact"}
          </Button>
          {selectedTypes.length > 1 && (
            <Button variant="outline" onClick={() => setSelectedTypes(["EXECUTIVE_SUMMARY"])} className="shrink-0">Clear</Button>
          )}
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

      {transformations.length > 0 && activeTx?.outputContent && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">Generated artefacts — {transformations.length} deliverable{transformations.length !== 1 ? "s" : ""}</h3>
              <p className="text-xs text-muted-foreground">
                {OUTPUT_LABELS[activeTx.outputType]} · {policyDisplayName(activeTx.profile)} · {activeTx.model}
                {activeTx.tone ? ` · ${activeTx.tone} · ${activeTx.language} · ${activeTx.detailLevel}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ValidationBadge status={activeTx.outputDlp} />
              <ValidationBadge status={activeTx.grounding} />
              <Button variant="outline" size="sm" onClick={handleCopyOutput} className="h-7 gap-1.5 text-xs font-medium">
                {copied ? <Check className="h-3.5 w-3.5 text-[var(--risk-safe)]" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadOutput} className="h-7 gap-1.5 text-xs font-medium">
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>
          </div>
          {transformations.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {transformations.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setViewTxId(t.id)}
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${activeTx.id === t.id ? "bg-primary text-primary-foreground border-primary" : "bg-muted hover:bg-muted/80 border-border"}`}
                >
                  {OUTPUT_LABELS[t.outputType]}
                </button>
              ))}
            </div>
          )}
          <div className="mt-3 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2 overflow-auto scroll-thin rounded-lg border border-border bg-muted/30 p-4 max-h-[28rem]">
              <pre className="m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] font-mono text-xs leading-relaxed">{sanitizeForDisplay(activeTx.outputContent ?? "")}</pre>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Grounding citations</h4>
              <div className="max-h-[26rem] space-y-2 overflow-auto scroll-thin">
                {activeTx.citations.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No citable claims detected.</p>
                ) : (
                  activeTx.citations.map((c, i) => (
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
                    <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-2" title={f.reason}>{f.reason}</p>
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
        <pre className="mt-3 max-h-64 overflow-auto scroll-thin whitespace-pre-wrap break-words [overflow-wrap:anywhere] rounded-lg border border-border bg-muted/30 p-3 font-mono text-[11px] leading-relaxed">
          {sanitizeForDisplay(report.sanitizedPreview)}
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
  if (error) return <Card className="p-5 text-sm text-destructive">Failed to load intelligence: {error}</Card>;
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
                    <span className="text-muted-foreground">{policyDisplayName(t.profile)}</span>
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
