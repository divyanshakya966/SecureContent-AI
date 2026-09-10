"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/secure/badges";
import { UploadCloud, ScanLine, ShieldAlert, ScrollText, Wand2, Sparkles, FileCheck2, Lock, ArrowRight, Network, Bug, Database } from "lucide-react";

const PIPELINE = [
  { icon: UploadCloud, label: "Ingestion", desc: "Validate type/size, extract text and metadata.", color: "var(--chart-4)" },
  { icon: ScanLine, label: "Scan", desc: "Detect PII, secrets, injection in parallel.", color: "var(--risk-medium)" },
  { icon: ShieldAlert, label: "Risk", desc: "Weighted score and classification.", color: "var(--risk-high)" },
  { icon: ScrollText, label: "Policy", desc: "Route findings to allow/mask/remove/block.", color: "var(--risk-low)" },
  { icon: Wand2, label: "Sanitize", desc: "Produce isolated working copy.", color: "var(--chart-2)" },
  { icon: Sparkles, label: "Transform", desc: "Generate output with isolation prompt.", color: "var(--primary)" },
  { icon: FileCheck2, label: "Validate", desc: "DLP rescan and grounding check.", color: "var(--risk-safe)" },
];

const THREATS = [
  { threat: "Prompt injection", impact: "Model manipulation", defense: "Envelope + quarantine", icon: Bug },
  { threat: "PII leakage", impact: "Privacy violation", defense: "Scan + mask/redact", icon: ShieldAlert },
  { threat: "Secret leakage", impact: "Credential exposure", defense: "Pattern + entropy", icon: Lock },
  { threat: "Hallucination", impact: "Misinformation", defense: "Grounding check", icon: FileCheck2 },
  { threat: "Excessive agency", impact: "Unauthorized action", defense: "Least privilege", icon: Network },
  { threat: "Unbounded use", impact: "Cost / DoS", defense: "Size/rate limits", icon: Database },
];

const BOUNDARIES = ["T1 Browser → Backend", "T2 Backend → Parser", "T3 Sanitized → LLM", "T4 LLM → Validator", "T5 Backend → Storage"];

export function ArchitectureView() {
  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-2"><Network className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Pipeline</h3></div>
        <p className="mt-1 text-xs text-muted-foreground">Security controls across the transformation flow.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {PIPELINE.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="relative">
                <div className="flex h-full flex-col rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-md border" style={{ color: s.color, borderColor: `color-mix(in oklch, ${s.color} 35%, transparent)`, backgroundColor: `color-mix(in oklch, ${s.color} 10%, transparent)` }}><Icon className="h-3.5 w-3.5" /></div>
                    <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="mt-2 text-xs font-semibold">{s.label}</div>
                  <p className="mt-1 text-[11px] text-muted-foreground">{s.desc}</p>
                </div>
                {i < PIPELINE.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/40 xl:block" />}
              </div>
            );
          })}
        </div>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-center gap-2"><Bug className="h-4 w-4 text-[var(--risk-critical)]" /><h3 className="text-sm font-semibold">Threats</h3></div>
          <div className="mt-3 space-y-2">
            {THREATS.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.threat} className="flex items-start gap-3 rounded-lg border border-border p-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted"><Icon className="h-3.5 w-3.5 text-muted-foreground" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{t.threat}</div>
                    <p className="text-[11px] text-muted-foreground">Impact: {t.impact} · Defense: {t.defense}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">Trust boundaries</h3></div>
            <div className="mt-3 space-y-1.5">
              {BOUNDARIES.map((b) => <div key={b} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px]"><span className="h-1.5 w-1.5 rounded-full bg-primary" />{b}</div>)}
            </div>
          </Card>
          <Card className="p-5">
            <h3 className="text-sm font-semibold">Stack</h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Next.js 16", "TypeScript", "Tailwind 4", "shadcn/ui", "Prisma + SQLite", "Recharts", "OWASP GenAI"].map((s) => <Badge key={s} className="bg-muted text-muted-foreground border-border font-mono text-[10px]">{s}</Badge>)}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
