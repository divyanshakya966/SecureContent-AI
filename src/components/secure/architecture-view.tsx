"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/secure/badges";
import {
  UploadCloud, ScanLine, ShieldAlert, ScrollText, Wand2,
  Sparkles, FileCheck2, Lock, ArrowRight, Network, Bug, Database,
} from "lucide-react";

const PIPELINE = [
  { icon: UploadCloud, label: "Ingestion & Parsing", desc: "File type + size validation, content extraction, structured metadata. Every upload is treated as hostile until inspected.", color: "var(--chart-4)" },
  { icon: ScanLine, label: "Security Gateway", desc: "PII, secret and prompt-injection detectors run in parallel. Confidence fusion produces a single finding set with severity and a recommended action.", color: "var(--risk-medium)" },
  { icon: ShieldAlert, label: "Risk Scoring & Classification", desc: "Transparent weighted model — PII, secrets, injection, internal assets, output leakage, minus mitigation credit. Auto-assigns PUBLIC → RESTRICTED.", color: "var(--risk-high)" },
  { icon: ScrollText, label: "Policy Engine", desc: "Routes every finding into allow / mask / remove / block buckets based on the selected transformation profile.", color: "var(--risk-low)" },
  { icon: Wand2, label: "Sanitization / Isolation", desc: "Produces a sanitized working copy. Untrusted content is wrapped in an explicit envelope so the model treats it as data, never instructions.", color: "var(--chart-2)" },
  { icon: Sparkles, label: "Grounded Transformation", desc: "GenAI generates the requested output. System prompt enforces isolation; output is constrained by the profile.", color: "var(--primary)" },
  { icon: FileCheck2, label: "Output DLP & Grounding", desc: "Deterministic re-scan for PII/secrets, citation check against the source. PASS → release, FAIL → repair or block.", color: "var(--risk-safe)" },
];

const THREATS = [
  { threat: "Prompt injection", impact: "Model behavior manipulation", defense: "Isolation envelope + detector + quarantine", icon: Bug },
  { threat: "PII leakage", impact: "Privacy violation", defense: "Pre/post DLP scan + mask/redact", icon: ShieldAlert },
  { threat: "Secret leakage", impact: "Credential compromise", defense: "Pattern + entropy + context secret scan", icon: Lock },
  { threat: "Hallucination", impact: "Misinformation", defense: "Grounding + citation check", icon: FileCheck2 },
  { threat: "Excessive agency", impact: "Unauthorized action", defense: "No tool access + least privilege", icon: Network },
  { threat: "Unbounded use", impact: "Cost / DoS", defense: "Size limits + per-document quotas", icon: Database },
];

const BOUNDARIES = [
  "T1 · Browser → Backend",
  "T2 · Backend → File Parser",
  "T3 · Sanitized content → LLM",
  "T4 · LLM → Output validator",
  "T5 · Backend → Storage",
];

export function ArchitectureView() {
  return (
    <div className="space-y-4">
      {/* Pipeline */}
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Zero-trust transformation pipeline</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground max-w-2xl">
          Security is the control plane of the transformation pipeline, not a wrapper around the AI.
          Every stage produces an auditable artifact.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {PIPELINE.map((stage, i) => {
            const Icon = stage.icon;
            return (
              <div key={stage.label} className="relative">
                <div className="flex h-full flex-col rounded-lg border border-border p-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex h-7 w-7 items-center justify-center rounded-md border"
                      style={{
                        color: stage.color,
                        borderColor: `color-mix(in oklch, ${stage.color} 35%, transparent)`,
                        backgroundColor: `color-mix(in oklch, ${stage.color} 10%, transparent)`,
                      }}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">{String(i + 1).padStart(2, "0")}</span>
                  </div>
                  <div className="mt-2 text-xs font-semibold leading-tight">{stage.label}</div>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{stage.desc}</p>
                </div>
                {i < PIPELINE.length - 1 && (
                  <ArrowRight className="absolute -right-2.5 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-muted-foreground/40 xl:block" />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Threat model */}
        <Card className="p-5">
          <div className="flex items-center gap-2">
            <Bug className="h-4 w-4 text-[var(--risk-critical)]" />
            <h3 className="text-sm font-semibold">Threat model</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Lightweight STRIDE + GenAI-specific threats</p>
          <div className="mt-3 space-y-2">
            {THREATS.map((t) => {
              const Icon = t.icon;
              return (
                <div key={t.threat} className="flex items-start gap-3 rounded-lg border border-border p-2.5">
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold">{t.threat}</div>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="text-foreground/70">Impact:</span> {t.impact}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      <span className="text-[var(--risk-safe)]">Defense:</span> {t.defense}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Trust boundaries + tech */}
        <div className="space-y-4">
          <Card className="p-5">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Trust boundaries</h3>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Every crossing is authenticated, validated and logged</p>
            <div className="mt-3 space-y-1.5">
              {BOUNDARIES.map((b) => (
                <div key={b} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 font-mono text-[11px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                  {b}
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="text-sm font-semibold">Stack</h3>
            <p className="text-xs text-muted-foreground">What this prototype is built on</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Next.js 16", "TypeScript", "Tailwind 4", "shadcn/ui", "Prisma + SQLite", "Recharts", "z-ai-web-dev-sdk", "OWASP GenAI LLM Top 10 (2026)"].map((s) => (
                <Badge key={s} className="bg-muted text-muted-foreground border-border font-mono text-[10px]">{s}</Badge>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
