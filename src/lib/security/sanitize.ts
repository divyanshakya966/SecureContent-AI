// SecureContent AI — Sanitization engine
// Applies policy-driven actions to the document: MASK, REDACT, REPLACE,
// QUARANTINE, BLOCK. Produces a sanitized working copy that is sent to the
// GenAI transformation layer instead of the raw content.
//
// Design intent (per blueprint):
//   - Prompt-injection spans are always QUARANTINED — the text is removed from
//     the working copy and the model is told to treat document content as data,
//     never instructions. The document is still transformable.
//   - Secrets/PII in the "block" bucket are REDACTED (force-removed) rather
//     than blocking the whole document, because the span can always be safely
//     removed.
//   - Document-level BLOCK only triggers when, after sanitization, almost no
//     usable content remains — i.e. the source was effectively a credential /
//     injection dump with nothing to transform.

import type { PolicyRule, SanitizeAction } from "@/types";
import type { RawFinding } from "./detectors";

export interface SanitizeActionRecord {
  finding: RawFinding;
  action: SanitizeAction;
  reason: string;
}

export interface SanitizeOutput {
  sanitizedContent: string;
  actions: SanitizeActionRecord[];
  blocked: boolean;
  blockReason?: string;
}

// Map a finding to the action the policy wants applied.
function bucketForFinding(
  finding: RawFinding,
  policy: PolicyRule
): SanitizeAction {
  // Prompt-injection spans are ALWAYS quarantined, regardless of bucket.
  if (finding.category === "PROMPT_INJECTION") return "QUARANTINE";

  if (policy.block.includes(finding.type) || policy.block.includes(finding.category)) {
    // Force-remove the span. The document can still be transformed; the
    // secret simply must not survive into the working copy.
    return "REDACT";
  }
  if (policy.remove.includes(finding.type) || policy.remove.includes(finding.category)) {
    return "REDACT";
  }
  if (policy.mask.includes(finding.type) || policy.mask.includes(finding.category)) {
    return "MASK";
  }
  return finding.defaultAction;
}

export function sanitizeContent(
  content: string,
  findings: RawFinding[],
  policy: PolicyRule
): SanitizeOutput {
  // Process findings from the END of the string backwards so offsets stay valid.
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  let out = content;
  const actions: SanitizeActionRecord[] = [];

  for (const f of sorted) {
    const action = bucketForFinding(f, policy);
    let replacement: string;
    let reason: string;

    switch (action) {
      case "REDACT":
        replacement = f.maskedText || "[REDACTED]";
        reason = `Redacted under policy "${policy.name}" — ${f.reason}`;
        break;
      case "REPLACE":
        replacement = f.maskedText || "[REPLACED]";
        reason = `Replaced with semantic abstraction under policy "${policy.name}".`;
        break;
      case "MASK":
        replacement = f.maskedText || "[MASKED]";
        reason = `Masked under policy "${policy.name}" — ${f.reason}`;
        break;
      case "QUARANTINE":
        replacement = f.maskedText || "[QUARANTINED]";
        reason = `Quarantined prompt-injection span under policy "${policy.name}" — content treated as data, not instructions.`;
        break;
      default:
        replacement = f.maskedText || "[REDACTED]";
        reason = f.reason;
    }

    out = out.slice(0, f.start) + replacement + out.slice(f.end);
    actions.push({ finding: f, action, reason });
  }

  actions.reverse();

  // Document-level BLOCK: refuse transformation only if, after sanitization,
  // almost no usable prose remains (source was effectively a sensitive dump).
  // Use a conservative word-aware heuristic. Masked PII like "ra***@example.org"
  // counts as usable (not stripped), so short legitimate sentences are preserved.
  // Injection-only docs are never blocked — they are always quarantined and
  // treated as data.
  const usable = out.replace(/\[([A-Z_ ]+)\]/g, "").replace(/\s+/g, " ").trim();
  const usableWords = usable.split(/\s+/).filter(Boolean).length;
  const allInjection = findings.length > 0 && findings.every((f) => f.category === "PROMPT_INJECTION");
  if (allInjection) {
    return { sanitizedContent: out, actions, blocked: false };
  }
  if (usable.length < 15 && findings.length > 0) {
    return {
      sanitizedContent: content,
      blocked: true,
      actions,
      blockReason: `After sanitization only ${usable.length} characters (${usableWords} words) of usable content remained. Policy "${policy.name}" refuses to transform a document with no transformable prose.`,
    };
  }

  return { sanitizedContent: out, actions, blocked: false };
}
