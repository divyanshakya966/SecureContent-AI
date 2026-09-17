"use client";

import { useRouter } from "next/navigation";
import { documentPath } from "@/lib/nav";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Users, Crown, HeartHandshake, Bug, Eye, ArrowRight, Inbox, FileScan } from "lucide-react";
import { api } from "@/lib/api-client";
import type { DocumentRecord, PolicyCompareResult, TransformationProfile, OutputType, PolicyRule } from "@/types";
import { policyDisplayName } from "@/lib/security/policies";
import { sanitizeForDisplay } from "@/lib/text";
import { HelpButton } from "@/components/secure/help-button";

/** Clamped preview with a native expand/collapse affordance. */
function ExpandablePreview({ text, clampClass = "line-clamp-[10]" }: { text: string; clampClass?: string }) {
  if (!text || text === "(empty)" || text === "— BLOCKED —") {
    return <div className="text-xs leading-relaxed font-mono whitespace-pre-wrap">{text || "(empty)"}</div>;
  }
  return (
    <details className="group">
      <div className={`text-xs leading-relaxed font-mono whitespace-pre-wrap ${clampClass} group-open:line-clamp-none`}>{text}</div>
      <summary className="mt-1.5 cursor-pointer text-[11px] font-medium text-primary hover:underline list-none [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">Show more</span>
        <span className="hidden group-open:inline">Show less</span>
      </summary>
    </details>
  );
}

const PROFILE_META: Record<TransformationProfile, { label: string; audience: string; icon: any; color: string; description: string }> = {
  PUBLIC_RELEASE: { label: "Public Release", audience: "General Public", icon: Eye, color: "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30", description: "High-level facts only" },
  INTERNAL_SUMMARY: { label: "Internal Summary", audience: "Internal Teams", icon: Users, color: "bg-[var(--chart-4)]/10 text-[var(--chart-4)] border-[var(--chart-4)]/30", description: "Aggregate internal detail" },
  EXECUTIVE_BRIEF: { label: "Executive Brief", audience: "Leadership", icon: Crown, color: "bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border-[var(--risk-medium)]/30", description: "Strategic context" },
  HR_SAFE: { label: "HR Safe", audience: "HR", icon: HeartHandshake, color: "bg-[var(--chart-5)]/10 text-[var(--chart-5)] border-[var(--chart-5)]/30", description: "Roles, not names" },
  SECURITY_INCIDENT: { label: "Security Incident", audience: "SOC / IR", icon: Bug, color: "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30", description: "IOCs/TTPs preserved" },
};

const BUILTIN_PROFILES: TransformationProfile[] = ["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"];

const CUSTOM_PROFILE_META = { label: "", audience: "Custom policy", icon: ShieldCheck, color: "bg-primary/10 text-primary border-primary/30", description: "Your policy" };

function metaFor(profile: string, policies: PolicyRule[]): { label: string; audience: string; icon: any; color: string; description: string } {
  const known = PROFILE_META[profile as TransformationProfile];
  if (known) return known;
  const p = policies.find((x) => x.name === profile);
  return {
    ...CUSTOM_PROFILE_META,
    label: policyDisplayName(profile),
    audience: p?.audience ?? p?.classification ?? "Custom",
    description: p?.description?.slice(0, 60) || "Your policy",
  };
}

export function PolicyCompareView() {
  const router = useRouter();
  const openDocument = (id: string) => router.push(documentPath(id));
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [outputType, setOutputType] = useState<OutputType>("EXECUTIVE_SUMMARY");
  const [result, setResult] = useState<PolicyCompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allPolicies, setAllPolicies] = useState<PolicyRule[]>([]);
  const [extraProfiles, setExtraProfiles] = useState<string[]>([]);
  const profiles = useMemo(() => [...BUILTIN_PROFILES.map(String), ...extraProfiles].slice(0, 10), [extraProfiles]);
  const customPolicies = useMemo(() => allPolicies.filter((p) => p.active && !(BUILTIN_PROFILES as string[]).includes(p.name)), [allPolicies]);

  useEffect(() => {
    api.listDocuments().then((l) => {
      setDocs(l);
      if (l.length) setSelectedId(l[0].id);
    }).catch(() => {});
    api.getPolicies().then(setAllPolicies).catch(() => setAllPolicies([]));
  }, []);

  const runCompare = useCallback(async () => {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.policyCompare(selectedId, profiles, outputType);
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [selectedId, outputType, profiles]);

  useEffect(() => {
    if (selectedId) runCompare();
  }, [selectedId, outputType, runCompare]);

  function toggleExtra(name: string) {
    setExtraProfiles((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name].slice(0, 5));
  }

  const doc = docs.find((d) => d.id === selectedId);
  const empty = docs.length === 0;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[18px] font-semibold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Policy Lab
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-[72ch]">
          Same source, {profiles.length} polic{profiles.length !== 1 ? "ies" : "y"} side-by-side — built-ins plus any custom policies you add. Compare sanitized previews and risk before/after.
        </p>
      </div>

      {empty && (
        <Card className="p-8 text-center border-dashed bg-muted/20">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-dashed bg-background">
            <Inbox className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="mt-3 text-sm font-semibold">No source document</div>
          <p className="mx-auto mt-1 max-w-[52ch] text-xs leading-relaxed text-muted-foreground">
            Ingest a document to collect information. Policy comparison requires a processed document — upload or paste a file through the pipeline, then return here to compare how each audience policy transforms the same source.
          </p>
          <Button size="sm" className="mt-4" onClick={() => router.push("/ingest")}>
            Ingest document
          </Button>
          <p className="mt-3 text-[11px] text-muted-foreground">No mock comparison is shown until you process a document manually.</p>
        </Card>
      )}

      {!empty && (
        <Card className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="grid gap-3 md:grid-cols-2 flex-1 min-w-0">
            <div className="min-w-0">
              <label className="text-xs font-medium">Source document</label>
              <Select value={selectedId} onValueChange={setSelectedId}>
                <SelectTrigger className="mt-1 w-full max-w-full">
                  <SelectValue placeholder="Pick a document" />
                </SelectTrigger>
                <SelectContent>
                  {docs.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.title} — {d.classification}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          <div className="min-w-0">
            <label className="text-xs font-medium">Output type</label>
            <Select value={outputType} onValueChange={(v) => setOutputType(v as OutputType)}>
              <SelectTrigger className="mt-1 w-full max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EXECUTIVE_SUMMARY">Executive Summary</SelectItem>
                <SelectItem value="FAQ">FAQ</SelectItem>
                <SelectItem value="TECHNICAL_REPORT">Technical Report</SelectItem>
                <SelectItem value="SLIDE_OUTLINE">Slide Outline</SelectItem>
                <SelectItem value="EMAIL_DRAFT">Email Draft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={runCompare} disabled={busy || !selectedId} size="sm">
            {busy ? "Comparing…" : "Compare policies"}
          </Button>
          {doc && (
            <Button variant="outline" size="sm" onClick={() => openDocument(doc.id)}>
              Open document
            </Button>
          )}
        </div>
          </div>
          {customPolicies.length > 0 && (
            <div className="border-t border-border pt-3">
              <div className="text-xs font-medium flex items-center gap-1.5">
                Include custom policies
                <HelpButton title="Custom policies in the lab">Your active custom policies can join the comparison (up to 5 extra, 10 total). Manage them in Policies.</HelpButton>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {customPolicies.map((p) => {
                  const checked = extraProfiles.includes(p.name);
                  return (
                    <label key={p.id} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${checked ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/60"}`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleExtra(p.name)} className="h-3.5 w-3.5 accent-primary" />
                      {policyDisplayName(p.name)}
                    </label>
                  );
                })}
              </div>
            </div>
          )}
      </Card>
      )}

      {error && <Card className="p-3 border-destructive/30 bg-destructive/5 text-xs text-destructive">{error}</Card>}

      {doc && (
        <Card className="p-3 flex items-center gap-2 sm:gap-3 bg-muted/30 border-dashed min-w-0">
          <span className="text-xs font-medium shrink-0">Source:</span>
          <span className="text-xs truncate min-w-0" title={doc.title}>{doc.title}</span>
          <span className="hidden md:inline text-[11px] text-muted-foreground truncate min-w-0">· {sanitizeForDisplay(doc.sanitizedContent ?? doc.rawContent).slice(0, 80)}…</span>
          <span className="ml-auto text-[11px] rounded border bg-card px-2 py-0.5 shrink-0 whitespace-nowrap">{doc.classification} · {doc.riskScore}/100</span>
        </Card>
      )}

      {!empty && (
        result ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {result.items.map((item) => {
              const meta = metaFor(String(item.profile), allPolicies);
              const Icon = meta.icon;
              return (
                <Card key={item.profile} className="flex flex-col p-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`shrink-0 inline-flex h-7 w-7 items-center justify-center rounded-md border ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <div className="leading-tight min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate" title={meta.label}>{meta.label}</div>
                      <div className="text-[10px] text-muted-foreground truncate" title={`${meta.audience} · ${meta.description}`}>{meta.audience} · {meta.description}</div>
                    </div>
                    <Badge className={`ml-auto shrink-0 whitespace-nowrap text-[10px] ${item.blocked ? "bg-[var(--risk-critical)]/10 text-[var(--risk-critical)] border-[var(--risk-critical)]/30" : "bg-[var(--risk-safe)]/10 text-[var(--risk-safe)] border-[var(--risk-safe)]/30"}`}>
                      {item.blocked ? "BLOCKED" : `risk ${item.riskAfter}/100`}
                    </Badge>
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border bg-muted/30 p-2">
                      <div className="text-[10px] text-muted-foreground">Before</div>
                      <div className="text-sm font-bold">{item.riskBefore}</div>
                    </div>
                    <div className="flex items-center justify-center"><ArrowRight className="h-4 w-4 text-muted-foreground" /></div>
                    <div className="rounded border bg-muted/30 p-2">
                      <div className="text-[10px] text-muted-foreground">After</div>
                      <div className={`text-sm font-bold ${item.riskAfter < item.riskBefore ? "text-[var(--risk-safe)]" : ""}`}>{item.riskAfter}</div>
                    </div>
                  </div>

                  <div className="mt-3 text-[11px] text-muted-foreground">
                    {item.findingsRedacted} spans redacted/masked/quarantined · {item.blocked ? item.blockReason?.slice(0, 80) : "transformable"}
                  </div>

                  <div className="mt-3 rounded-md border bg-muted/40 p-3">
                    <div className="text-[11px] font-semibold mb-1">Sanitized preview</div>
                    <ExpandablePreview text={item.blocked ? "— BLOCKED —" : sanitizeForDisplay(item.sanitizedPreview) || "(empty)"} />
                  </div>

                  {item.transformation && (
                    <div className="mt-3 rounded-md border bg-card p-3">
                      <div className="text-[11px] font-semibold">Last transformation</div>
                      <div className="text-[11px] text-muted-foreground">{item.transformation.outputType} · {item.transformation.model} · DLP {item.transformation.outputDlp} · grounding {item.transformation.grounding}</div>
                      <div className="mt-1"><ExpandablePreview text={`${sanitizeForDisplay(item.transformation.outputContent ?? "").slice(0, 1200)}…`} clampClass="line-clamp-4" /></div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="p-8 text-center border-dashed bg-muted/20 text-xs text-muted-foreground">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-dashed bg-background">
              <FileScan className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-2 text-sm font-medium text-foreground">Awaiting comparison</div>
            <p className="mx-auto mt-1 max-w-[48ch]">Ingest a document through the pipeline, then select it above to generate the five-way policy comparison. Genuine sanitized previews and risk deltas will appear here.</p>
          </Card>
        )
      )}

      <Card className="p-4 bg-muted/30 border-dashed">
        <div className="flex items-center gap-1.5 text-xs font-semibold tracking-tight">
          How it works
          <HelpButton title="Policy comparison">
            Each policy defines allow / mask / remove / block buckets over finding types. The same source is sanitized five ways — PUBLIC_RELEASE strips everything while SECURITY_INCIDENT preserves timeline and indicators — then transformed. Raw secrets never reach the model; document content is always treated as data, never instructions.
          </HelpButton>
        </div>
        <div className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
          Same source, every selected policy side-by-side — compare sanitized previews and risk before/after.
        </div>
      </Card>
    </div>
  );
}
