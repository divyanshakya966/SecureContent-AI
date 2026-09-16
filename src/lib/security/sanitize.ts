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
  /** True when a reviewer override (not the policy bucket) decided the action. */
  overridden?: boolean;
}

export interface SanitizeOutput {
  sanitizedContent: string;
  actions: SanitizeActionRecord[];
  blocked: boolean;
  blockReason?: string;
}

/**
 * Reviewer-chosen actions keyed by finding identity.
 * Enforced invariants (defense in depth — the API validates these too):
 * - PROMPT_INJECTION can never be ALLOWed; ALLOW degrades to QUARANTINE.
 * - SECRET findings can never be ALLOWed; ALLOW degrades to REDACT.
 */
export type FindingOverrides = Map<string, SanitizeAction>;

export function overrideKeyForFinding(f: Pick<RawFinding, "start" | "end" | "type">): string {
  return `char_offset:${f.start}-${f.end}|${f.type}`;
}

// Map a finding to the action the policy wants applied.
function bucketForFinding(
  finding: RawFinding,
  policy: PolicyRule,
  overrides?: FindingOverrides
): SanitizeAction {
  // Reviewer override wins over buckets — except it can never weaken the two
  // hard invariants below.
  if (overrides) {
    const key = overrideKeyForFinding(finding);
    const chosen = overrides.get(key);
    if (chosen) {
      if (chosen === "ALLOW") {
        if (finding.category === "PROMPT_INJECTION") return "QUARANTINE";
        if (finding.category === "SECRET") return "REDACT";
      }
      if (finding.category === "PROMPT_INJECTION" && chosen !== "QUARANTINE" && chosen !== "REDACT") {
        return "QUARANTINE";
      }
      return chosen;
    }
  }

  // Prompt-injection spans are ALWAYS quarantined, regardless of bucket.
  if (finding.category === "PROMPT_INJECTION") return "QUARANTINE";

  // Explicit allow-list wins: listed types/categories pass through untouched.
  if (policy.allow.includes(finding.type) || policy.allow.includes(finding.category)) {
    return "ALLOW";
  }

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
  policy: PolicyRule,
  overrides?: FindingOverrides
): SanitizeOutput {
  // Process findings from the END of the string backwards so offsets stay valid.
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  let out = content;
  const actions: SanitizeActionRecord[] = [];

  for (const f of sorted) {
    const action = bucketForFinding(f, policy, overrides);
    const overridden = overrides?.has(overrideKeyForFinding(f)) === true && action !== bucketForFinding(f, policy);
    // ALLOW = pass through untouched (policy explicitly permits this type).
    if (action === "ALLOW") {
      actions.push({ finding: f, action, reason: `Allowed under policy "${policy.name}" — ${f.reason}`, overridden });
      continue;
    }
    // Guard against stale/invalid offsets (e.g. persisted 0-0 spans): skip
    // instead of corrupting the working copy by inserting at position 0.
    if (!Number.isFinite(f.start) || !Number.isFinite(f.end) || f.start < 0 || f.end <= f.start || f.end > out.length + 4096) {
      continue;
    }
    const start = Math.max(0, Math.min(f.start, out.length));
    const end = Math.max(start, Math.min(f.end, out.length));
    if (end <= start) continue;
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

    out = out.slice(0, start) + replacement + out.slice(end);
    actions.push({
      finding: f,
      action,
      reason: overridden ? `Reviewer override under policy "${policy.name}" — ${reason}` : reason,
      overridden,
    });
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
