// Output DLP: re-scan generated content before release. Never trust the model to self-enforce.

import type { PolicyRule } from "@/types";
import type { RawFinding } from "./detectors";
import { detectOutputLeakage } from "./detectors";

export interface OutputDlpResult {
  passed: boolean;
  leakageFindings: RawFinding[];
  reasons: string[];
  repairedContent: string;
}

export function runOutputDlp(
  content: string,
  policy: PolicyRule
): OutputDlpResult {
  const leaks = detectOutputLeakage(content);

  if (leaks.length === 0) {
    return {
      passed: true,
      leakageFindings: [],
      reasons: ["No PII, secrets, or restricted material detected in generated output."],
      repairedContent: content,
    };
  }

  const reasons: string[] = [];
  const blocked = leaks.some(
    (l) => policy.block.includes(l.type) || policy.block.includes(l.category)
  );

  reasons.push(
    `Detected ${leaks.length} leakage candidate${leaks.length === 1 ? "" : "s"} in generated output.`
  );
  for (const l of leaks.slice(0, 5)) {
    reasons.push(
      `${l.type} @ offset ${l.start}: ${l.reason}`
    );
  }
  if (blocked) {
    reasons.push("At least one BLOCK-listed entity leaked — release refused.");
  }

  // Redact detected spans from the end backwards.
  const sorted = [...leaks].sort((a, b) => b.start - a.start);
  let repaired = content;
  for (const l of sorted) {
    repaired = repaired.slice(0, l.start) + (l.maskedText || "[REDACTED]") + repaired.slice(l.end);
  }

  return {
    passed: false,
    leakageFindings: leaks,
    reasons,
    repairedContent: repaired,
  };
}
