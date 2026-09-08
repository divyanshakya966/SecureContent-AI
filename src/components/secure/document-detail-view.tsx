"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import {
  ArrowLeft, Loader2, ShieldCheck, Sparkles, FileCheck2, RefreshCw,
  ScanLine, Wand2, AlertTriangle, CheckCircle2, XCircle, ScrollText, ChevronRight,
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
import {
  riskColor, riskLabel, formatRelativeTime, formatBytes, CATEGORY_META,
} from "@/lib/display";
import { cn } from "@/lib/utils";

type Tab = "overview" | "findings" | "diff" | "transform" | "report" | "history";

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <Button variant="ghost" size="sm" onClick={() => setView("documents")} className="w-fit h-7 text-xs text-muted-foreground">
          <ArrowLeft className="mr-1 h-3.5 w-3.5" /> All documents
        </Button>
        <Card className="p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold tracking-tight">{doc.title}</h2>
                <ClassificationBadge value={doc.classification} />
                <StatusBadge status={doc.status} />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
                <span>{doc.filename}</span>
                <span>·</span>
                <span>{formatBytes(doc.sizeBytes)}</span>
                <span>·</span>
                <span>{doc.metadata.wordCount ?? 0} words</span>
                <span>·</span>
                <span>SHA256 {doc.metadata.sha256?.slice(0, 12) ?? "—"}…</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <RiskGauge value={doc.status === "SANITIZED" || doc.status === "TRANSFORMED" ? doc.riskAfter || 0 : doc.riskBefore} before={doc.riskBefore} size={108} />
              <div className="hidden sm:flex flex-col gap-2">
                <Button variant="outline" size="sm" onClick={runScan} disabled={!!busy} className="h-8 gap-1.5">
                  {busy === "scan" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5" />}
                  Re-scan
                </Button>
                <Button size="sm" onClick={() => setTab("diff")} disabled={!!busy} className="h-8 gap-1.5">
                  <Wand2 className="h-3.5 w-3.5" /> Sanitize
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="h-10 w-full justify-start overflow-x-auto scroll-thin">
          <TabsTrigger value="overview" className="gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="findings" className="gap-1.5">
            <ScanLine className="h-3.5 w-3.5" />Findings
            <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{inputFindings.length}</span>
          </TabsTrigger>
          <TabsTrigger value="diff" className="gap-1.5"><Wand2 className="h-3.5 w-3.5" />Before / After</TabsTrigger>
          <TabsTrigger value="transform" className="gap-1.5"><Sparkles className="h-3.5 w-3.5" />Transform</TabsTrigger>
          <TabsTrigger value="report" className="gap-1.5"><FileCheck2 className="h-3.5 w-3.5" />Security Report</TabsTrigger>
          <TabsTrigger value="history" className="gap-1.5"><ScrollText className="h-3.5 w-3.5" />History</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-4">
          <OverviewTab doc={doc} inputFindings={inputFindings} categoryCounts={categoryCounts} outputFindings={outputFindings} />
        </TabsContent>

        {/* FINDINGS */}
        <TabsContent value="findings" className="mt-4">
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold">Detected findings</h3>
                <p className="text-xs text-muted-foreground">{inputFindings.length} input-stage findings · {outputFindings.length} output-stage</p>
              </div>
            </div>
            <FindingsTable findings={inputFindings} emptyHint="No sensitive content detected. Document is clean." />
          </Card>
        </TabsContent>

        {/* DIFF / SANITIZE */}
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
        <h3 className="text-sm font-semibold">Security summary</h3>
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
          <div className="mb-2 text-[11px] uppercase tracking-wider text-muted-foreground">Severity distribution</div>
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
        <h3 className="text-sm font-semibold">Validation gate</h3>
        <p className="text-xs text-muted-foreground">Most recent transformation</p>
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
          <div className="space-y-2 sm:max-w-xs">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Transformation policy</Label>
            <Select value={policy} onValueChange={setPolicy}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(POLICY_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="font-medium">{v}</span>
                    <span className="ml-2 font-mono text-[10px] text-muted-foreground">{k}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              The policy decides which finding types are masked, redacted, replaced or blocked before the model ever sees the content.
            </p>
          </div>
          <Button onClick={() => onSanitize(policy)} disabled={!!busy} className="gap-1.5">
            {busy === "sanitize" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Apply policy &amp; sanitize
          </Button>
        </div>
      </Card>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Before / After</h3>
          {doc.sanitizedContent ? (
            <span className="font-mono text-[11px] text-[var(--risk-safe)]">sanitized copy ready</span>
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">not yet sanitized</span>
          )}
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
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Output format</Label>
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
              Generate securely
            </Button>
          </div>
        </div>
        {doc.status === "BLOCKED" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--risk-critical)]/30 bg-[var(--risk-critical)]/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--risk-critical)]" />
            <span>This document is blocked by policy. Sanitize or adjust the policy before transforming.</span>
          </div>
        )}
        {!doc.sanitizedContent && doc.status !== "BLOCKED" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--risk-medium)]/30 bg-[var(--risk-medium)]/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--risk-medium)]" />
            <span>No sanitized copy yet — the raw content will be scanned first, then transformed. For best results, sanitize first.</span>
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
