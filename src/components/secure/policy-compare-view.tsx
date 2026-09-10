"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Users, Crown, HeartHandshake, Bug, Eye, ArrowRight } from "lucide-react";
import { api } from "@/lib/api-client";
import type { DocumentRecord, PolicyCompareResult, TransformationProfile, OutputType } from "@/types";
import { useApp } from "@/lib/store";

const PROFILE_META: Record<TransformationProfile, { label: string; audience: string; icon: any; color: string; description: string }> = {
  PUBLIC_RELEASE: { label: "Public Release", audience: "General Public", icon: Eye, color: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30", description: "High-level facts only" },
  INTERNAL_SUMMARY: { label: "Internal Summary", audience: "Internal Teams", icon: Users, color: "bg-blue-500/10 text-blue-700 border-blue-500/30", description: "Aggregate internal detail" },
  EXECUTIVE_BRIEF: { label: "Executive Brief", audience: "Leadership", icon: Crown, color: "bg-amber-500/10 text-amber-700 border-amber-500/30", description: "Strategic context" },
  HR_SAFE: { label: "HR Safe", audience: "HR", icon: HeartHandshake, color: "bg-violet-500/10 text-violet-700 border-violet-500/30", description: "Roles, not names" },
  SECURITY_INCIDENT: { label: "Security Incident", audience: "SOC / IR", icon: Bug, color: "bg-red-500/10 text-red-700 border-red-500/30", description: "IOCs/TTPs preserved" },
};

export function PolicyCompareView() {
  const { openDocument } = useApp();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [outputType, setOutputType] = useState<OutputType>("EXECUTIVE_SUMMARY");
  const [result, setResult] = useState<PolicyCompareResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listDocuments().then((l) => {
      setDocs(l);
      if (l.length) setSelectedId(l[0].id);
    }).catch(() => {});
  }, []);

  async function runCompare() {
    if (!selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.policyCompare(selectedId, ["PUBLIC_RELEASE", "INTERNAL_SUMMARY", "EXECUTIVE_BRIEF", "HR_SAFE", "SECURITY_INCIDENT"], outputType);
      setResult(r);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (selectedId) runCompare();
  }, [selectedId, outputType]);

  const doc = docs.find((d) => d.id === selectedId);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          Policy-Aware Transformation
        </h2>
        <p className="text-xs text-muted-foreground">
          Same source, different audiences — each receives only the information its policy permits. Compare sanitized previews and risk before/after.
        </p>
      </div>

      <Card className="p-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="grid gap-3 md:grid-cols-2 flex-1">
          <div>
            <label className="text-xs font-medium">Source document</label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Pick a document" />
              </SelectTrigger>
              <SelectContent>
                {docs.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.title} — {d.classification}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Output type</label>
            <Select value={outputType} onValueChange={(v) => setOutputType(v as OutputType)}>
              <SelectTrigger className="mt-1">
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
        <div className="flex gap-2">
          <Button onClick={runCompare} disabled={busy || !selectedId} size="sm">
            {busy ? "Comparing…" : "Compare policies"}
          </Button>
          {doc && (
            <Button variant="outline" size="sm" onClick={() => openDocument(doc.id)}>
              Open document
            </Button>
          )}
        </div>
      </Card>

      {error && <Card className="p-3 border-red-500/30 bg-red-500/5 text-xs text-red-600">{error}</Card>}

      {doc && (
        <Card className="p-3 flex items-center gap-3 bg-muted/30 border-dashed">
          <span className="text-xs font-medium">Source:</span>
          <span className="text-xs truncate">{doc.title}</span>
          <span className="text-[11px] text-muted-foreground">· {doc.rawContent.slice(0, 80)}…</span>
          <span className="ml-auto text-[11px] rounded border bg-card px-2 py-0.5">{doc.classification} · risk {doc.riskScore}/100</span>
        </Card>
      )}

      {result ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {result.items.map((item) => {
            const meta = PROFILE_META[item.profile];
            const Icon = meta.icon;
            return (
              <Card key={item.profile} className="flex flex-col p-4">
                <div className="flex items-center gap-2">
                  <span className={`inline-flex h-7 w-7 items-center justify-center rounded-md border ${meta.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="leading-tight">
                    <div className="text-xs font-semibold">{meta.label}</div>
                    <div className="text-[10px] text-muted-foreground">{meta.audience} · {meta.description}</div>
                  </div>
                  <Badge className={`ml-auto text-[10px] ${item.blocked ? "bg-red-500/10 text-red-600 border-red-500/30" : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"}`}>
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
                    <div className={`text-sm font-bold ${item.riskAfter < item.riskBefore ? "text-emerald-600" : ""}`}>{item.riskAfter}</div>
                  </div>
                </div>

                <div className="mt-3 text-[11px] text-muted-foreground">
                  {item.findingsRedacted} spans redacted/masked/quarantined · {item.blocked ? item.blockReason?.slice(0, 80) : "transformable"}
                </div>

                <div className="mt-3 rounded-md border bg-muted/40 p-3">
                  <div className="text-[11px] font-semibold mb-1">Sanitized preview</div>
                  <div className="text-xs leading-relaxed font-mono line-clamp-[10] whitespace-pre-wrap">{item.blocked ? "— BLOCKED —" : item.sanitizedPreview || "(empty)"}</div>
                </div>

                {item.transformation && (
                  <div className="mt-3 rounded-md border bg-card p-3">
                    <div className="text-[11px] font-semibold">Last transformation</div>
                    <div className="text-[11px] text-muted-foreground">{item.transformation.outputType} · {item.transformation.model} · DLP {item.transformation.outputDlp} · grounding {item.transformation.grounding}</div>
                    <div className="mt-1 text-xs line-clamp-4 leading-relaxed">{item.transformation.outputContent?.slice(0, 260)}…</div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center text-xs text-muted-foreground">Select a document and run “Compare policies” to see how each audience’s output differs.</Card>
      )}

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="text-xs font-semibold">How it works</div>
        <div className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Each policy defines <span className="font-medium">allow / mask / remove / block</span> buckets over finding types. The same raw content is sanitized five different ways — <span className="font-medium">PUBLIC_RELEASE</span> strips everything, <span className="font-medium">SECURITY_INCIDENT</span> preserves IOCs/TTPs/timeline — then transformed. No raw secret ever reaches the model; the <span className="font-medium">&lt;UNTRUSTED_DOCUMENT&gt;</span> envelope enforces treat-as-data.
        </div>
      </Card>
    </div>
  );
}
