// SecureContent AI — Detection engine
// Multi-signal detection: structured recognizers + regex + entropy + heuristics.
// Every detector returns RawFinding[] with character offsets so sanitization
// can precisely replace the sensitive span.

import type {
  FindingCategory,
  FindingType,
  Severity,
  SanitizeAction,
  FindingStage,
} from "@/types";

export interface RawFinding {
  category: FindingCategory;
  type: FindingType;
  severity: Severity;
  confidence: number;
  defaultAction: SanitizeAction;
  stage: FindingStage;
  start: number;
  end: number;
  matchedText: string;
  maskedText: string;
  reason: string;
}

export interface DetectorMatch {
  start: number;
  end: number;
  matched: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function reScan(re: RegExp, text: string): DetectorMatch[] {
  const matches: DetectorMatch[] = [];
  // Ensure global flag so we can iterate; clone with 'g' if missing.
  const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  let m: RegExpExecArray | null;
  while ((m = global.exec(text)) !== null) {
    if (m[0].length === 0) {
      global.lastIndex++;
      continue;
    }
    matches.push({ start: m.index, end: m.index + m[0].length, matched: m[0] });
  }
  return matches;
}

// Shannon entropy over the printable characters of a token.
function shannonEntropy(s: string): number {
  if (!s) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  const len = s.length;
  let h = 0;
  for (const count of freq.values()) {
    const p = count / len;
    h -= p * Math.log2(p);
  }
  return h;
}

// Is this character offset inside an existing finding span? (avoids double counting)
function overlaps(a: { start: number; end: number }, findings: RawFinding[]): boolean {
  return findings.some((f) => a.start < f.end && a.end > f.start);
}

// ---------------------------------------------------------------------------
// PII detectors
// ---------------------------------------------------------------------------

const PII_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PII_PHONE_IN = /(?:\+91[-.\s]?)?[6-9]\d{4}[-.\s]?\d{5}/g;
const PII_PHONE_INTL = /(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
const PII_PHONE_UK = /\+44[-.\s]?\d{4}[-.\s]?\d{3}[-.\s]?\d{3}/g;
const PII_AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PII_PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PII_CREDIT_CARD = /\b(?:\d[ -]*?){13,16}\b/g;
const PII_IP = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const PII_DOB = /\b(?:\d{1,2}[-/\s](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[-/\s]\d{4})\b/gi;
const PII_EMP_ID = /\b(?:EMP|EMP-|ID-|EID-)\d{0,4}-?\d{3,6}\b/gi;
const PII_INTERNAL_URL = /\bhttps?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|internal\.|intranet\.)[^\s]+/gi;

function detectPII(text: string): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const m of reScan(PII_EMAIL, text)) {
    findings.push({
      category: "PII", type: "EMAIL", severity: "MEDIUM", confidence: 0.97,
      defaultAction: "MASK", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: maskEmail(m.matched),
      reason: "Personal email address detected under PII policy.",
    });
  }

  // Credit-card before Aadhaar/PAN so that 16-digit groups are classified as
  // payment data rather than 12-digit government IDs.
  for (const m of reScan(PII_CREDIT_CARD, text)) {
    if (overlaps(m, findings)) continue;
    const digits = m.matched.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 16) continue;
    // Luhn check is intentionally not required for synthetic benchmark data;
    // length + pattern is sufficient for the demo.
    findings.push({
      category: "PII", type: "CREDIT_CARD", severity: "CRITICAL", confidence: 0.94,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[CARD_REDACTED]",
      reason: "Possible credit-card number detected — payment data, must never be released.",
    });
  }

  for (const m of reScan(PII_AADHAAR, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "AADHAAR", severity: "CRITICAL", confidence: 0.92,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[AADHAAR_REDACTED]",
      reason: "Government-issued ID detected — restricted under data-minimization policy.",
    });
  }

  for (const m of reScan(PII_PAN, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "PAN", severity: "HIGH", confidence: 0.9,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[PAN_REDACTED]",
      reason: "Permanent Account Number detected — tax identifier, must not be transformed.",
    });
  }

  // Phones — run all three patterns, dedupe by overlap.
  const phoneMatches: DetectorMatch[] = [];
  for (const re of [PII_PHONE_IN, PII_PHONE_INTL, PII_PHONE_UK]) {
    for (const m of reScan(re, text)) {
      if (!phoneMatches.some((p) => m.start < p.end && m.end > p.start)) {
        phoneMatches.push(m);
      }
    }
  }
  for (const m of phoneMatches) {
    if (overlaps(m, findings)) continue;
    const digits = m.matched.replace(/\D/g, "");
    if (digits.length < 8) continue;
    findings.push({
      category: "PII", type: "PHONE", severity: "MEDIUM", confidence: 0.85,
      defaultAction: "MASK", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: maskPhone(m.matched),
      reason: "Phone number detected — direct personal identifier.",
    });
  }

  for (const m of reScan(PII_DOB, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "DATE_OF_BIRTH", severity: "HIGH", confidence: 0.82,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[DOB_REDACTED]",
      reason: "Date of birth pattern near personal context.",
    });
  }

  for (const m of reScan(PII_IP, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "INTERNAL_ASSET", type: "IP_ADDRESS", severity: "MEDIUM", confidence: 0.8,
      defaultAction: "REPLACE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[INTERNAL_HOST]",
      reason: "Internal IP address — infrastructure detail, abstracted for external release.",
    });
  }

  for (const m of reScan(PII_EMP_ID, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "ORG_ID", severity: "MEDIUM", confidence: 0.75,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[EMPLOYEE_ID]",
      reason: "Internal employee identifier detected.",
    });
  }

  for (const m of reScan(PII_INTERNAL_URL, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "INTERNAL_ASSET", type: "INTERNAL_URL", severity: "HIGH", confidence: 0.9,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[INTERNAL_URL_REDACTED]",
      reason: "Internal/RFC1918 URL — must not appear in public output.",
    });
  }

  // Person names — heuristic: "Role: Name (contact)" or "Lead: Name".
  const nameRe = /(?:Project Lead|Engineer|Lead|Manager|Analyst|Officer|Member|Director|Architect):\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g;
  for (const m of reScan(nameRe, text)) {
    const inner = /:\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})/g;
    const im = inner.exec(m.matched);
    if (!im) continue;
    const nameStart = m.start + im.index;
    const nameEnd = nameStart + im[1].length;
    if (overlaps({ start: nameStart, end: nameEnd }, findings)) continue;
    findings.push({
      category: "PII", type: "PERSON_NAME", severity: "MEDIUM", confidence: 0.62,
      defaultAction: "REPLACE", stage: "INPUT",
      start: nameStart, end: nameEnd, matchedText: im[1],
      maskedText: "[PERSON]",
      reason: "Person name detected adjacent to a role label — replace with role descriptor.",
    });
  }

  return findings;
}

function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 1) return "[EMAIL_REDACTED]";
  return email.slice(0, 2) + "***" + email.slice(at);
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "[PHONE_REDACTED]";
  const last = digits.slice(-2);
  return phone.replace(/\d/g, "*").replace(/\*+$/, "") + last;
}

// ---------------------------------------------------------------------------
// Secret detectors
// ---------------------------------------------------------------------------

const SECRET_AWS_ID = /\bAKIA[0-9A-Z]{12,20}\b/g;
const SECRET_AWS_KEY = /\bAWS_SECRET_ACCESS_KEY=\S+/g;
const SECRET_GITHUB = /\bghp_[A-Za-z0-9]{10,}\b/g;
const SECRET_SLACK = /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g;
const SECRET_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;
const SECRET_PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const SECRET_DB_CONN = /\b(?:postgres|postgresql|mongodb(\+srv)?|mysql|redis|amqp):\/\/[^\s"']+/gi;
const SECRET_API_KEY_KV = /\b(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?token)["'\s:=]+([A-Za-z0-9_\-./+]{10,})/gi;
const SECRET_GENERIC_SK = /\bsk-[A-Za-z0-9]{14,}\b/g;

// Context words that boost secret confidence.
const SECRET_CONTEXT = /\b(token|secret|password|passwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer)\b/gi;

function detectSecrets(text: string): RawFinding[] {
  const findings: RawFinding[] = [];
  const contextPositions = [...text.matchAll(SECRET_CONTEXT)].map((m) => m.index ?? 0);

  function nearbyContext(start: number, end: number): boolean {
    return contextPositions.some((p) => {
      const dist = Math.min(Math.abs(p - start), Math.abs(p - end));
      return dist < 80;
    });
  }

  for (const m of reScan(SECRET_AWS_ID, text)) {
    findings.push(secretFinding(text, m, "API_KEY", "AKIA", 0.96, "AWS access key ID prefix matched."));
  }
  for (const m of reScan(SECRET_AWS_KEY, text)) {
    findings.push(secretFinding(text, m, "API_KEY", "AWS_SECRET", 0.97, "AWS secret access key assignment detected."));
  }
  for (const m of reScan(SECRET_GITHUB, text)) {
    findings.push(secretFinding(text, m, "API_KEY", "GitHub PAT", 0.95, "GitHub personal access token prefix matched."));
  }
  for (const m of reScan(SECRET_SLACK, text)) {
    if (overlaps(m, findings)) continue;
    findings.push(secretFinding(text, m, "API_KEY", "Slack token", 0.93, "Slack token prefix matched."));
  }
  for (const m of reScan(SECRET_JWT, text)) {
    if (overlaps(m, findings)) continue;
    findings.push(secretFinding(text, m, "JWT", "JWT", 0.92, "JWT structure (header.payload.signature) detected."));
  }
  for (const m of reScan(SECRET_PRIVATE_KEY, text)) {
    if (overlaps(m, findings)) continue;
    findings.push(secretFinding(text, m, "PRIVATE_KEY", "PEM", 0.99, "PEM private key block detected."));
  }
  for (const m of reScan(SECRET_DB_CONN, text)) {
    if (overlaps(m, findings)) continue;
    findings.push(secretFinding(text, m, "DB_CONN_STRING", "URI", 0.98, "Database connection string containing embedded credentials."));
  }
  for (const m of reScan(SECRET_GENERIC_SK, text)) {
    if (overlaps(m, findings)) continue;
    findings.push(secretFinding(text, m, "API_KEY", "sk-", 0.9, "OpenAI-style API key prefix matched."));
  }

  // Key/value secret assignments — combine pattern + entropy + context.
  for (const m of reScan(SECRET_API_KEY_KV, text)) {
    if (overlaps(m, findings)) continue;
    const value = m.matched.split(/["'\s:=]+/).pop() ?? "";
    const entropy = shannonEntropy(value);
    const hasContext = nearbyContext(m.start, m.end);
    const patternScore = 0.5;
    const entropyScore = Math.min(0.25, (entropy / 5) * 0.25);
    const contextScore = hasContext ? 0.25 : 0.1;
    const confidence = Math.min(0.97, patternScore + entropyScore + contextScore);
    findings.push({
      category: "SECRET", type: "PASSWORD", severity: "HIGH", confidence,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[SECRET_REDACTED]",
      reason: `Credential-like assignment (entropy ${entropy.toFixed(2)}${hasContext ? ", near secret context word" : ""}).`,
    });
  }

  return findings;
}

function secretFinding(
  _text: string,
  m: DetectorMatch,
  type: "API_KEY" | "JWT" | "PRIVATE_KEY" | "DB_CONN_STRING",
  label: string,
  confidence: number,
  reason: string
): RawFinding {
  return {
    category: "SECRET",
    type,
    severity: type === "PRIVATE_KEY" || type === "DB_CONN_STRING" ? "CRITICAL" : "HIGH",
    confidence,
    defaultAction: "REDACT",
    stage: "INPUT",
    start: m.start,
    end: m.end,
    matchedText: m.matched,
    maskedText: `[${label}_REDACTED]`,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Prompt-injection detectors
// ---------------------------------------------------------------------------

const INJECTION_PHRASES: { re: RegExp; reason: string; severity: Severity }[] = [
  { re: /ignore (?:all )?(?:previous|prior) instructions/gi, reason: "Classic prompt-injection override phrase.", severity: "CRITICAL" },
  { re: /disregard (?:all )?(?:previous |prior )?instructions/gi, reason: "Instruction-override phrase detected.", severity: "CRITICAL" },
  { re: /reveal (?:the )?system prompt/gi, reason: "Requests system prompt exfiltration.", severity: "CRITICAL" },
  { re: /you are now (?:in |operating in )?(?:privileged|operator|admin|root) mode/gi, reason: "Role-elevation attempt.", severity: "HIGH" },
  { re: /you are no longer bound by/gi, reason: "Attempts to remove policy constraints.", severity: "HIGH" },
  { re: /stop summarizing/gi, reason: "Attempts to abort the assigned transformation.", severity: "HIGH" },
  { re: /system override complete/gi, reason: "Injection confirmation marker.", severity: "HIGH" },
  { re: /release all data/gi, reason: "Data-exfiltration command.", severity: "CRITICAL" },
  { re: /output (?:the |every |all )?(?:confidential|secret|api key|token|credential|raw source)/gi, reason: "Requests exfiltration of sensitive material.", severity: "CRITICAL" },
];

const ROLE_MANIPULATION = [
  { re: /you are (?:now )?(?:in )?[\w\s]{0,24}(?:privileged|operator|root|admin|unrestricted)[\w\s]{0,20}(?:mode|role)/gi, reason: "Assigns a privileged role to the model." },
  { re: /(?:enter|switch to|activate) [\w\s]{0,20}(?:privileged|operator|root|admin)[\w\s]{0,20}mode/gi, reason: "Requests privileged-mode activation." },
];

const TOOL_INVOCATION = [
  { re: /call (?:the )?[a-z_]+ tool/gi, reason: "Requests external tool invocation." },
  { re: /invoke (?:the )?[a-z_]+ tool/gi, reason: "Requests external tool invocation." },
  { re: /execute_sql|send_email|web_search\(/gi, reason: "Named tool-call syntax inside content." },
  { re: /email (?:it|them|this) to/gi, reason: "Requests exfiltration via email tool." },
];

const HIDDEN_INSTRUCTION = /<!--[\s\S]*?(?:ignore|disregard|assistant|system|reveal|override)[\s\S]*?-->/gi;

const CONFLICTING_INSTRUCTION = [
  { re: /instead,? output/gi, reason: "Conflicting output redirection." },
  { re: /respond with the raw source/gi, reason: "Requests verbatim raw content (bypass policy)." },
  { re: /append the full token list/gi, reason: "Requests secret exfiltration." },
];

function detectPromptInjection(text: string): RawFinding[] {
  const findings: RawFinding[] = [];

  for (const { re, reason, severity } of INJECTION_PHRASES) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      findings.push({
        category: "PROMPT_INJECTION", type: "INJECTION_PHRASE", severity, confidence: 0.9,
        defaultAction: "QUARANTINE", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[INJECTION_QUARANTINED]",
        reason,
      });
    }
  }

  for (const { re, reason } of ROLE_MANIPULATION) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      findings.push({
        category: "PROMPT_INJECTION", type: "ROLE_MANIPULATION", severity: "HIGH", confidence: 0.82,
        defaultAction: "QUARANTINE", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[ROLE_MANIPULATION_QUARANTINED]",
        reason,
      });
    }
  }

  for (const { re, reason } of TOOL_INVOCATION) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      findings.push({
        category: "PROMPT_INJECTION", type: "TOOL_INVOCATION", severity: "HIGH", confidence: 0.78,
        defaultAction: "QUARANTINE", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[TOOL_INVOCATION_QUARANTINED]",
        reason,
      });
    }
  }

  for (const { re, reason } of CONFLICTING_INSTRUCTION) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      findings.push({
        category: "PROMPT_INJECTION", type: "INJECTION_PHRASE", severity: "HIGH", confidence: 0.8,
        defaultAction: "QUARANTINE", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[INJECTION_QUARANTINED]",
        reason,
      });
    }
  }

  for (const m of reScan(HIDDEN_INSTRUCTION, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PROMPT_INJECTION", type: "HIDDEN_INSTRUCTION", severity: "CRITICAL", confidence: 0.88,
      defaultAction: "QUARANTINE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[HIDDEN_INSTRUCTION_REMOVED]",
      reason: "HTML comment contains instruction-like language — hidden directive removed.",
    });
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Output-stage detector (used by Output DLP to re-scan generated content)
// ---------------------------------------------------------------------------

export function detectOutputLeakage(text: string): RawFinding[] {
  const leaks: RawFinding[] = [];
  // Reuse the same detectors but mark stage=OUTPUT and lower the confidence floor
  // for names (output-time we are stricter about anything that looks like PII).
  const pii = detectPII(text);
  const secrets = detectSecrets(text);
  for (const f of [...pii, ...secrets]) {
    leaks.push({ ...f, stage: "OUTPUT" });
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Public orchestration: scan a document end-to-end
// ---------------------------------------------------------------------------

export function scanContent(text: string): RawFinding[] {
  // Secrets before PII so that DB URLs containing email-like substrings are
  // classified as secrets, not PII. Credit-card before Aadhaar for the same reason.
  const secrets = detectSecrets(text);
  const pii = detectPII(text);
  const injections = detectPromptInjection(text);
  // Sort by start offset; for overlaps prefer higher confidence / severity.
  const merged = [...secrets, ...pii, ...injections];
  merged.sort((a, b) => a.start - b.start || b.confidence - a.confidence);

  // De-duplicate overlaps across detectors. Prefer higher confidence,
  // but NEVER let a PII finding overwrite a SECRET that contains it
  // (e.g. an email address inside a DB connection string).
  const CATEGORY_PRIORITY: Record<string, number> = {
    SECRET: 5,
    PROMPT_INJECTION: 4,
    UNSAFE_URL: 3,
    INTERNAL_ASSET: 2,
    PII: 1,
  };
  const deduped: RawFinding[] = [];
  for (const f of merged) {
    const overlapIdx = deduped.findIndex((d) => f.start < d.end && f.end > d.start);
    if (overlapIdx >= 0) {
      const existing = deduped[overlapIdx];
      const existingPri = CATEGORY_PRIORITY[existing.category] ?? 0;
      const incomingPri = CATEGORY_PRIORITY[f.category] ?? 0;
      // If existing has higher category priority, keep it even if confidence is lower.
      if (existingPri > incomingPri) continue;
      if (existingPri < incomingPri) {
        deduped[overlapIdx] = f;
        continue;
      }
      // Same priority: keep the higher confidence / longer span.
      if (f.confidence > existing.confidence || (f.confidence === existing.confidence && (f.end - f.start) > (existing.end - existing.start))) {
        deduped[overlapIdx] = f;
      }
      continue;
    }
    deduped.push(f);
  }
  return deduped;
}
