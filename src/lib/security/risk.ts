// SecureContent AI — Risk scoring + classification
// Transparent, weighted risk model so reviewers can understand the score.

import type { Classification, Severity } from "@/types";
import type { RawFinding } from "./detectors";

const SEVERITY_WEIGHT: Record<Severity, number> = {
  LOW: 4,
  MEDIUM: 10,
  HIGH: 20,
  CRITICAL: 35,
};

const CATEGORY_WEIGHT: Record<string, number> = {
  PII: 1.0,
  SECRET: 1.4,
  PROMPT_INJECTION: 1.6,
  INTERNAL_ASSET: 0.7,
  UNSAFE_URL: 0.8,
};

export interface RiskBreakdown {
  pii: number;
  secrets: number;
  promptInjection: number;
  internalAssets: number;
  unsafeUrls: number;
  total: number;
  classification: Classification;
}

export function computeRisk(findings: RawFinding[]): RiskBreakdown {
  let pii = 0;
  let secrets = 0;
  let promptInjection = 0;
  let internalAssets = 0;
  let unsafeUrls = 0;

  for (const f of findings) {
    const base = SEVERITY_WEIGHT[f.severity] * (f.confidence ?? 0.5);
    const weighted = base * (CATEGORY_WEIGHT[f.category] ?? 1);
    switch (f.category) {
      case "PII": pii += weighted; break;
      case "SECRET": secrets += weighted; break;
      case "PROMPT_INJECTION": promptInjection += weighted; break;
      case "INTERNAL_ASSET": internalAssets += weighted; break;
      case "UNSAFE_URL": unsafeUrls += weighted; break;
    }
  }

  const raw =
    pii * 1.0 +
    secrets * 1.0 +
    promptInjection * 1.0 +
    internalAssets * 0.6 +
    unsafeUrls * 0.6;

  // Mitigation credit — every REDACT / QUARANTINE / BLOCK action reduces the
  // residual risk because that span will not reach the model verbatim.
  const mitigation = findings.reduce((acc, f) => {
    if (f.defaultAction === "REDACT") return acc + SEVERITY_WEIGHT[f.severity] * 0.6;
    if (f.defaultAction === "QUARANTINE") return acc + SEVERITY_WEIGHT[f.severity] * 0.8;
    if (f.defaultAction === "BLOCK") return acc + SEVERITY_WEIGHT[f.severity] * 0.9;
    if (f.defaultAction === "REPLACE") return acc + SEVERITY_WEIGHT[f.severity] * 0.4;
    if (f.defaultAction === "MASK") return acc + SEVERITY_WEIGHT[f.severity] * 0.3;
    return acc;
  }, 0);

  const mitigated = Math.max(0, raw - mitigation * 0.4);
  const total = Math.min(100, Math.round(mitigated));
  const classification = classify(findings, mitigated);

  return {
    pii: Math.round(pii),
    secrets: Math.round(secrets),
    promptInjection: Math.round(promptInjection),
    internalAssets: Math.round(internalAssets),
    unsafeUrls: Math.round(unsafeUrls),
    total,
    classification,
  };
}

function classify(findings: RawFinding[], residualRisk: number): Classification {
  const hasInjection = findings.some((f) => f.category === "PROMPT_INJECTION");
  const hasCriticalSecret = findings.some(
    (f) => f.category === "SECRET" && f.severity === "CRITICAL"
  );
  const hasGovtId = findings.some((f) => f.type === "AADHAAR" || f.type === "PAN" || f.type === "CREDIT_CARD");

  if (hasInjection && (hasCriticalSecret || residualRisk > 60)) return "RESTRICTED";
  if (hasCriticalSecret || hasGovtId || residualRisk >= 55) return "CONFIDENTIAL";
  if (residualRisk >= 20) return "INTERNAL";
  if (residualRisk > 0) return "INTERNAL";
  return "PUBLIC";
}

export function severityRank(s: Severity): number {
  return { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s];
}
