// Policy-driven sanitization: MASK, REDACT, REPLACE, QUARANTINE, BLOCK.
// Injections are always quarantined; blocked secrets are force-removed;
// the whole document is refused only when no usable prose remains.

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


function bucketForFinding(
  finding: RawFinding,
  policy: PolicyRule,
  overrides?: FindingOverrides
): SanitizeAction {
  // Reviewer overrides win, but never weaken the invariants below.
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


  if (finding.category === "PROMPT_INJECTION") return "QUARANTINE";


  if (policy.allow.includes(finding.type) || policy.allow.includes(finding.category)) {
    return "ALLOW";
  }

  if (policy.block.includes(finding.type) || policy.block.includes(finding.category)) {
    // Force-remove the span; the document stays transformable.
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
  // Backwards so offsets stay valid.
  const sorted = [...findings].sort((a, b) => b.start - a.start);
  let out = content;
  const actions: SanitizeActionRecord[] = [];

  for (const f of sorted) {
    const action = bucketForFinding(f, policy, overrides);
    const overridden = overrides?.has(overrideKeyForFinding(f)) === true && action !== bucketForFinding(f, policy);

    if (action === "ALLOW") {
      actions.push({ finding: f, action, reason: `Allowed under policy "${policy.name}" — ${f.reason}`, overridden });
      continue;
    }
    // Skip stale offsets instead of corrupting the working copy.
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

  // Refuse transformation only when almost no usable prose remains.
  // Masked PII counts as usable; injection-only docs are never blocked.
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
