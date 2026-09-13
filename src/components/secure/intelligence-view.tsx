"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Brain, ShieldAlert, Hash, Users, Crosshair, FileSearch, AlertTriangle, Globe, Fingerprint, Inbox } from "lucide-react";
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

function EmptyIntelligence({ onIngest }: { onIngest: () => void }) {
  return (
    <Card className="p-8 text-center border-dashed bg-muted/20">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-dashed bg-background">
        <Inbox className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="mt-3 text-sm font-semibold">No intelligence collected</div>
      <p className="mx-auto mt-1 max-w-[48ch] text-xs leading-relaxed text-muted-foreground">
        Ingest a document to collect information. Entities, IOCs, TTPs (MITRE ATT&amp;CK), risks and key findings are extracted automatically through the full pipeline — scan → intelligence extraction — and will populate this workspace after processing.
      </p>
      <Button size="sm" className="mt-4" onClick={onIngest}>
        Ingest document
      </Button>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Dashboard metrics remain empty until you process a document manually. No mock data is shown.
      </p>
    </Card>
  );
}

function PlaceholderCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/20 p-6 text-center">
      <div className="flex h-9 w-9 items-center justify-center rounded-full border border-dashed bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="max-w-[32ch] text-xs leading-relaxed text-muted-foreground">{description}</p>
    </div>
  );
}

export function IntelligenceView() {
  const { openDocument, setView } = useApp();
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
        <Card className="p-8 text-center text-muted-foreground border-dashed">Analyzing intelligence — genuine results appear after ingestion…</Card>
      </div>
    );
  }

  if (!docs.length) {
    return <EmptyIntelligence onIngest={() => setView("upload")} />;
  }

  const hasAnyReport = Object.keys(reports).length > 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-[18px] font-semibold tracking-tight flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Intelligence
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground max-w-[72ch]">
            Entities, IOCs, TTPs (MITRE ATT&CK), risks and key findings — extracted automatically after scan and filtered per audience policy. No mock data is shown until processing completes.
          </p>
        </div>
        <Badge className="bg-card border-border font-mono text-xs shrink-0">
          {Object.keys(reports).length} reports · {allEntities.length} entities · {allIOCs.length} IOCs · {allTTPs.length} TTPs
        </Badge>
      </div>

      {/* Aggregates — when no reports yet show placeholders */}
      {!hasAnyReport ? (
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="p-4 border-dashed bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Users className="h-3.5 w-3.5" /> Entities</div>
            <div className="mt-1 text-2xl font-mono text-muted-foreground">—</div>
            <div className="text-[11px] text-muted-foreground">Ingest to collect</div>
          </Card>
          <Card className="p-4 border-dashed bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Globe className="h-3.5 w-3.5" /> IOCs</div>
            <div className="mt-1 text-2xl font-mono text-muted-foreground">—</div>
            <div className="text-[11px] text-muted-foreground">Awaiting ingestion</div>
          </Card>
          <Card className="p-4 border-dashed bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><Crosshair className="h-3.5 w-3.5" /> TTPs</div>
            <div className="mt-1 text-2xl font-mono text-muted-foreground">—</div>
            <div className="text-[11px] text-muted-foreground">Ingest to analyze</div>
          </Card>
          <Card className="p-4 border-dashed bg-muted/20">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /> Risks</div>
            <div className="mt-1 text-2xl font-mono text-muted-foreground">—</div>
            <div className="text-[11px] text-muted-foreground">Awaiting pipeline</div>
          </Card>
        </div>
      ) : (
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
      )}

      {/* Tactic heatmap — placeholder when empty */}
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
      ) : hasAnyReport ? (
        <Card className="p-4 border-dashed bg-muted/20">
          <PlaceholderCard
            icon={Fingerprint}
            title="No ATT&CK tactics yet"
            description="Ingest a document containing adversarial indicators to generate MITRE ATT&CK tactic coverage."
          />
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
                  <div className="text-[10px] text-muted-foreground truncate">{d.classification} · {r ? `${r.entities.length} ent, ${r.iocs.length} IOC, ${r.ttps.length} TTP` : "Awaiting intelligence…"}</div>
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
                  {active.entities.length ? (
                    active.entities.slice(0, 12).map((e, i) => (
                      <div key={i} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                        <span className="text-xs font-mono truncate">{e.value}</span>
                        <span className="ml-2 shrink-0 rounded border bg-card px-1.5 py-0.5 text-[10px]">{e.type}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">No entities yet — ingest another document variation to collect information.</p>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><Hash className="h-3.5 w-3.5" /> IOCs ({active.iocs.length})</div>
                <div className="space-y-1.5 max-h-[220px] overflow-auto pr-1">
                  {active.iocs.length ? (
                    active.iocs.slice(0, 12).map((i, idx) => (
                      <div key={idx} className="flex items-center justify-between rounded border bg-muted/30 px-2 py-1.5">
                        <span className="text-xs font-mono truncate">{i.value}</span>
                        <span className={`ml-2 shrink-0 rounded border px-1.5 py-0.5 text-[10px] ${i.severity === "CRITICAL" ? "bg-red-500/10 text-red-600 border-red-500/30" : i.severity === "HIGH" ? "bg-orange-500/10 text-orange-600 border-orange-500/30" : "bg-muted text-muted-foreground"}`}>{i.type}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">No IOCs detected — ingest a document with infrastructure indicators to populate.</p>
                  )}
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
                <PlaceholderCard
                  icon={Crosshair}
                  title="No TTPs mapped"
                  description="Ingest a document containing adversarial behaviors to generate MITRE ATT&CK mappings. This panel will populate after pipeline analysis."
                />
              )}
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><ShieldAlert className="h-3.5 w-3.5" /> Risks ({active.risks.length})</div>
                <div className="space-y-1.5">
                  {active.risks.length ? (
                    active.risks.map((r, i) => (
                      <div key={i} className="rounded border bg-muted/30 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full ${r.severity === "CRITICAL" ? "bg-red-500" : r.severity === "HIGH" ? "bg-orange-500" : r.severity === "MEDIUM" ? "bg-amber-500" : "bg-emerald-500"}`} />
                          <span className="text-xs font-semibold">{r.category}</span>
                          <span className="ml-auto text-[10px] rounded border bg-card px-1">{r.severity}</span>
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{r.description}</div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">No risks synthesized — genuine results appear after document processing.</p>
                  )}
                </div>
              </Card>

              <Card className="p-4">
                <div className="text-xs font-semibold mb-2 flex items-center gap-2"><FileSearch className="h-3.5 w-3.5" /> Key Findings ({active.keyFindings.length})</div>
                <div className="space-y-2">
                  {active.keyFindings.length ? (
                    active.keyFindings.map((kf, i) => (
                      <div key={i} className="rounded border bg-card p-2.5">
                        <div className="text-xs leading-relaxed">{kf.finding}</div>
                        <div className="mt-1 font-mono text-[11px] text-muted-foreground">{kf.evidence} · <span className={kf.grounded ? "text-emerald-600" : "text-amber-600"}>{kf.grounded ? "grounded" : "ungrounded"}</span></div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground border border-dashed rounded-md p-3 text-center">No key findings yet — ingest a document to collect grounded observations.</p>
                  )}
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="p-8 text-center border-dashed bg-muted/20">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-dashed bg-background">
              <FileSearch className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="mt-2 text-sm font-medium">Select a document</div>
            <p className="mx-auto mt-1 max-w-[40ch] text-xs text-muted-foreground">Choose a document from the list to view its intelligence. Ingest a document to collect information.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
