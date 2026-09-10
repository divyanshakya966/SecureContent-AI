"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Brain, ShieldAlert, Hash, Users, Crosshair, FileSearch, AlertTriangle, Globe, Fingerprint } from "lucide-react";
import { api } from "@/lib/api-client";
import type { IntelligenceReport, DocumentRecord } from "@/types";
import { useApp } from "@/lib/store";

const TACTIC_COLOR: Record<string, string> = {
  "Initial Access": "bg-red-500/10 text-red-600 border-red-500/30",
  "Credential Access": "bg-orange-500/10 text-orange-600 border-orange-500/30",
  "Privilege Escalation": "bg-amber-500/10 text-amber-600 border-amber-500/30",
  "Defense Evasion": "bg-violet-500/10 text-violet-600 border-violet-500/30",
  "Discovery": "bg-blue-500/10 text-blue-600 border-blue-500/30",
  "Lateral Movement": "bg-cyan-500/10 text-cyan-600 border-cyan-500/30",
  "Exfiltration": "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

export function IntelligenceView() {
  const { openDocument } = useApp();
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [reports, setReports] = useState<Record<string, IntelligenceReport>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const list = await api.listDocuments();
        setDocs(list);
        if (list.length && !selected) setSelected(list[0].id);
        const map: Record<string, IntelligenceReport> = {};
        await Promise.all(
          list.slice(0, 8).map(async (d) => {
            try {
              const r = await api.getIntelligence(d.id);
              map[d.id] = r;
            } catch {}
          })
        );
        setReports(map);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const active = selected ? reports[selected] : null;
  const activeDoc = docs.find((d) => d.id === selected);

  // Aggregates
  const allTTPs = Object.values(reports).flatMap((r) => r.ttps);
  const allIOCs = Object.values(reports).flatMap((r) => r.iocs);
  const allEntities = Object.values(reports).flatMap((r) => r.entities);
  const tacticCounts = allTTPs.reduce((acc, t) => {
    acc[t.tactic] = (acc[t.tactic] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  if (loading) {
    return (
      <div className="grid gap-4">
        <Card className="p-8 text-center text-muted-foreground">Loading intelligence…</Card>
      </div>
    );
  }

  if (!docs.length) {
    return (
      <Card className="p-8 text-center">
        <Brain className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
        <p className="text-sm font-medium">No documents yet</p>
        <p className="text-xs text-muted-foreground">Upload or seed the attack samples to see intelligence extraction.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Intelligence-Aware Extraction
          </h2>
          <p className="text-xs text-muted-foreground">
            Automatically extracts entities, IOCs, TTPs (MITRE ATT&CK), risks, key findings & evidence — <span className="font-medium">policy-agnostic</span>, then filtered per audience.
          </p>
        </div>
        <Badge className="bg-[var(--risk-medium)]/10 text-[var(--risk-medium)] border-[var(--risk-medium)]/30">
          {Object.keys(reports).length} reports · {allEntities.length} entities · {allIOCs.length} IOCs · {allTTPs.length} TTPs
        </Badge>
      </div>

      {/* Aggregates */}
      <div className="grid gap-3 md:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Users className="h-3.5 w-3.5" /> Entities</div>
          <div className="mt-1 text-2xl font-bold">{allEntities.length}</div>
          <div className="text-[11px] text-muted-foreground">persons, orgs, emails, phones, IPs, dates</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Globe className="h-3.5 w-3.5" /> IOCs</div>
          <div className="mt-1 text-2xl font-bold">{allIOCs.length}</div>
          <div className="text-[11px] text-muted-foreground">IPs, domains, URLs, hashes, CVEs</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Crosshair className="h-3.5 w-3.5" /> TTPs</div>
          <div className="mt-1 text-2xl font-bold">{allTTPs.length}</div>
          <div className="text-[11px] text-muted-foreground">MITRE ATT&CK techniques</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Risks</div>
          <div className="mt-1 text-2xl font-bold">{Object.values(reports).reduce((a, r) => a + r.risks.length, 0)}</div>
          <div className="text-[11px] text-muted-foreground">synthesized from findings + IOCs/TTPs</div>
        </Card>
      </div>

      {/* Tactic heatmap */}
      {Object.keys(tacticCounts).length ? (
        <Card className="p-4">
          <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Fingerprint className="h-3.5 w-3.5" /> ATT&CK Tactic Coverage</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(tacticCounts).map(([tactic, count]) => (
              <span key={tactic} className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium ${TACTIC_COLOR[tactic] ?? "bg-muted text-muted-foreground border-border"}`}>
                {tactic} <span className="rounded bg-black/10 px-1 text-[10px]">{count}</span>
              </span>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* Doc selector */}
        <Card className="p-3 h-fit">
          <div className="text-xs font-semibold mb-2 flex items-center gap-2"><FileSearch className="h-3.5 w-3.5" /> Documents</div>
          <div className="space-y-1.5">
            {docs.map((d) => {
              const r = reports[d.id];
              const isActive = d.id === selected;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelected(d.id)}
                  className={`w-full text-left rounded-md border px-3 py-2 transition-colors ${isActive ? "bg-primary/10 border-primary/30" : "bg-card hover:bg-muted border-border"}`}
                >
                  <div className="text-xs font-medium truncate">{d.title}</div>
                  <div className="text-[10px] text-muted-foreground truncate">{d.classification} · {r ? `${r.entities.length} ent, ${r.iocs.length} IOC, ${r.ttps.length} TTP` : "—"}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Active report */}
        {active && activeDoc ? (
          <div className="space-y-4">
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{activeDoc.title}</div>
                  <div className="text-xs text-muted-foreground">{activeDoc.classification} · {active.classification} · model {active.model}</div>
                </div>
                <button
                  onClick={() => openDocument(activeDoc.id)}
                  className="rounded-md border border-border bg-card px-2.5 py-1 text-xs hover:bg-muted"
                >
                  Open document →
                </button>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground bg-muted/40 rounded-md p-3 border">{active.summary}</p>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Users className="h-3.5 w-3.5" /> Entities ({active.entities.length})</div>
                <div className="space-y-1.5 max-h-[220px] overflow-auto pr-1">
                  {active.entities.slice(0, 12).map((e, i) => (
                    <div key={i} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                      <span className="text-xs font-mono truncate">{e.value}</span>
                      <span className="ml-2 shrink-0 rounded border bg-card px-1.5 py-0.5 text-[10px]">{e.type}</span>
                    </div>
                  ))}
                  {!active.entities.length && <span className="text-xs text-muted-foreground">No entities extracted.</span>}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Hash className="h-3.5 w-3.5" /> IOCs ({active.iocs.length})</div>
                <div className="space-y-1.5 max-h-[220px] overflow-auto pr-1">
                  {active.iocs.slice(0, 12).map((i, idx) => (
                    <div key={idx} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                      <span className="text-xs font-mono truncate">{i.value}</span>
                      <span className={`ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${i.severity === "CRITICAL" ? "bg-red-500/10 text-red-600 border-red-500/30" : i.severity === "HIGH" ? "bg-orange-500/10 text-orange-600 border-orange-500/30" : "bg-muted text-muted-foreground"}`}>{i.type}</span>
                    </div>
                  ))}
                  {!active.iocs.length && <span className="text-xs text-muted-foreground">No IOCs detected.</span>}
                </div>
              </Card>
            </div>

            <Card className="p-4">
              <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Crosshair className="h-3.5 w-3.5" /> TTPs — MITRE ATT&CK ({active.ttps.length})</div>
              {active.ttps.length ? (
                <div className="space-y-2">
                  {active.ttps.map((t, i) => (
                    <div key={i} className="rounded-md border bg-card p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="rounded bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 text-xs font-mono">{t.mitreId}</span>
                        <span className="text-xs font-semibold">{t.technique}</span>
                        <span className={`rounded border px-1.5 py-0.5 text-[10px] ${TACTIC_COLOR[t.tactic] ?? "bg-muted text-muted-foreground"}`}>{t.tactic}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">conf {(t.confidence * 100).toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{t.evidence}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No TTPs mapped — add adversarial keywords or use the injection samples.</span>
              )}
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5" /> Risks ({active.risks.length})</div>
                <div className="space-y-1.5">
                  {active.risks.map((r, i) => (
                    <div key={i} className="rounded border bg-muted/30 p-2.5">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${r.severity === "CRITICAL" ? "bg-red-500" : r.severity === "HIGH" ? "bg-orange-500" : r.severity === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500"}`} />
                        <span className="text-xs font-semibold">{r.category}</span>
                        <span className="ml-auto text-[10px] rounded border bg-card px-1">{r.severity}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><FileSearch className="h-3.5 w-3.5" /> Key Findings ({active.keyFindings.length})</div>
                <div className="space-y-2">
                  {active.keyFindings.map((kf, i) => (
                    <div key={i} className="rounded border bg-card p-2.5">
                      <div className="text-xs leading-relaxed">{kf.finding}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">📎 {kf.evidence} · <span className={kf.grounded ? "text-emerald-600" : "text-amber-600"}>{kf.grounded ? "grounded" : "ungrounded"}</span></div>
                    </div>
                  ))}
                  {!active.keyFindings.length && <span className="text-xs text-muted-foreground">No key findings extracted.</span>}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="p-8 text-center text-xs text-muted-foreground">Select a document to see its intelligence.</Card>
        )}
      </div>
    </div>
  );
}
