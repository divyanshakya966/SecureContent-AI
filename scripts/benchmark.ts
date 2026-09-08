// SecureContent AI — Lightweight benchmark harness
// Measures: detection counts, risk_before/after, sanitization leakage, output DLP.
// Prints a markdown table for the PPT + a JSON summary.

import { SAMPLE_DOCUMENTS } from "@/lib/security/samples";
import { scanContent, sanitizeContent, computeRisk, runOutputDlp } from "@/lib/security";
import { DEFAULT_POLICIES } from "@/lib/security/policies";
import type { PolicyRule } from "@/types";

function policy(name: string): PolicyRule {
  const p = DEFAULT_POLICIES.find((x) => x.name === name)!;
  return {
    id: "bench", name: p.name, description: p.description,
    classification: p.classification as any, allow: [...p.allow], mask: [...p.mask], remove: [...p.remove], block: [...p.block],
    active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const profileFor = (cat: string) => {
  if (cat === "INJECTION" || cat === "MIXED" || cat === "SECRET_HEAVY") return "SECURITY_INCIDENT";
  if (cat === "PII_HEAVY") return "PUBLIC_RELEASE";
  return "INTERNAL_SUMMARY";
};

let totalFindings = 0;
let totalLeakage = 0;
let totalRiskBefore = 0;
let totalRiskAfter = 0;

console.log("| Sample | Category | Findings | Risk Before | Risk After | Δ | Leakage | Sanitized Blocked |");
console.log("|---|---|---:|---:|---:|---:|---:|---|");

for (const s of SAMPLE_DOCUMENTS) {
  const findings = scanContent(s.content);
  const riskBefore = computeRisk(findings);
  const pol = policy(profileFor(s.category));
  const sanitized = sanitizeContent(s.content, findings, pol);
  const residual = scanContent(sanitized.sanitizedContent);
  const riskAfter = computeRisk(residual);
  const dlp = runOutputDlp(sanitized.sanitizedContent, pol);

  totalFindings += findings.length;
  totalLeakage += dlp.leakageFindings.length;
  totalRiskBefore += riskBefore.total;
  totalRiskAfter += riskAfter.total;

  console.log(`| ${s.title} | ${s.category} | ${findings.length} | ${riskBefore.total} | ${riskAfter.total} | ${riskBefore.total - riskAfter.total} | ${dlp.leakageFindings.length} | ${sanitized.blocked ? "YES" : "no"} |`);
}

const n = SAMPLE_DOCUMENTS.length;
console.log("\nSummary:");
console.log(`- Documents: ${n}`);
console.log(`- Total findings detected: ${totalFindings}`);
console.log(`- Avg risk before: ${(totalRiskBefore / n).toFixed(1)} /100`);
console.log(`- Avg risk after: ${(totalRiskAfter / n).toFixed(1)} /100`);
console.log(`- Avg risk reduction: ${((totalRiskBefore - totalRiskAfter) / n).toFixed(1)} pts`);
console.log(`- Output leakage (sanitized): ${totalLeakage}`);
console.log(`- Leakage rate: ${((totalLeakage / Math.max(1, totalFindings)) * 100).toFixed(2)}% (target: 0%)`);
console.log("\nNote: synthetic benchmark — do not publish as production accuracy without a larger, labeled dataset.");
