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
  ScanConfig,
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
  groups?: string[];
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
    matches.push({ start: m.index, end: m.index + m[0].length, matched: m[0], groups: m.slice(1) });
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

function overlapsAny(a: { start: number; end: number }, spans: { start: number; end: number }[]): boolean {
  return spans.some((f) => a.start < f.end && a.end > f.start);
}

/** Luhn checksum — validates payment-card numbers, drastically cutting false positives. */
function luhnValid(digits: string): boolean {
  if (!/^\d{13,19}$/.test(digits)) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

/** Is `keyword` (case-insensitive) within `window` chars of [start, end)? */
function nearbyKeyword(text: string, start: number, end: number, keywords: string[], window = 60): boolean {
  const lo = Math.max(0, start - window);
  const hi = Math.min(text.length, end + window);
  const slice = text.slice(lo, hi).toLowerCase();
  return keywords.some((k) => slice.includes(k.toLowerCase()));
}

/** Strip invisible direction/zero-width chars for injection normalization. */
function normalizeInvisible(s: string): string {
  return s
    .replace(/[​‌‍﻿⁠]/g, "")
    .replace(/[‮‭‪⁦⁧⁨⁩]/g, "")
    .replace(/­/g, "");
}

// ---------------------------------------------------------------------------
// PII detectors
// ---------------------------------------------------------------------------

const PII_EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// UPI handles look like emails (name@upi). Distinguish via known handles list.
const UPI_HANDLES = new Set([
  "upi", "ybl", "okhdfc", "okhdfcbank", "okicici", "oksbi", "okaxis", "paytm",
  "ibl", "axl", "apl", "abfspay", "eze", "idbi", "hsbc", "kotak", "pnb", "sbi",
]);
const PII_PHONE_IN = /(?:\+91[-.\s]?)?[6-9]\d{4}[-.\s]?\d{5}/g;
const PII_PHONE_INTL = /\b(?:\+1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g;
const PII_PHONE_UK = /\+44[-.\s]?\d{4}[-.\s]?\d{3}[-.\s]?\d{3}/g;
const PII_PHONE_GENERIC = /\B\+\d{1,3}[-.\s]?\(?\d{1,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}(?:\s?(?:x|ext\.?)\s?\d{2,6})?\b/g;
const PII_AADHAAR = /\b\d{4}\s?\d{4}\s?\d{4}\b/g;
const PII_PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const PII_CREDIT_CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const PII_SSN = /\b(?!000|666|9\d{2})\d{3}-(?!00)\d{2}-(?!0000)\d{4}\b/g;
const PII_PASSPORT_US = /\b[CEHX][0-9]{8}\b/g;
const PII_PASSPORT_IN = /\b[A-Z][0-9]{7}\b/g;
const PII_DL_IN = /\b[A-Z]{2}\d{2}\s?\d{4}\s?\d{7}\b/g;
const PII_ZIP_US = /\b\d{5}(?:-\d{4})?\b/g;
const PII_PIN_IN = /\b[1-9]\d{5}\b/g;
const PII_IP = /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g;
const PII_IPV6 = /(?:\b(?:[0-9A-Fa-f]{1,4}:){2,7}[0-9A-Fa-f]{1,4}\b|\b::1\b|\b::\b|\bfe80::[^\s"']*)/g;
const PII_DOB_MON = /\b(?:\d{1,2}[-/\s](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[-/\s]\d{4})\b/gi;
const PII_DOB_EU = /\b(?:0?[1-9]|[12]\d|3[01])[/\-.](?:0?[1-9]|1[0-2])[/\-.](?:19|20)\d{2}\b/g;
const PII_DOB_ISO = /\b(?:19|20)\d{2}[/\-.](?:0?[1-9]|1[0-2])[/\-.](?:0?[1-9]|[12]\d|3[01])\b/g;
const PII_DOB_US = /\b(?:0?[1-9]|1[0-2])\/(?:0?[1-9]|[12]\d|3[01])\/(?:19|20)\d{2}\b/g;
const PII_EMP_ID = /\b(?:EMP|EMP-|ID-|EID-|STAFF-)\d{0,4}-?\d{3,6}\b/gi;
const PII_STREET = /\b\d{1,5}\s+[A-Z][a-z0-9.'-]*(?:\s+[A-Z][a-z0-9.'-]+){0,3}\s+(?:Street|St|Avenue|Ave|Road|Rd|Lane|Ln|Drive|Dr|Boulevard|Blvd|Court|Ct|Circle|Cir|Parkway|Pkwy|Terrace|Place|Plaza)\b/g;
const PII_POBOX = /\bP\.?\s?O\.?\s?Box\s+\d{1,6}\b/gi;
const PII_IBAN = /\b[A-Z]{2}\d{2} ?(?:[A-Z0-9]{4} ?){2,7}[A-Z0-9]{0,4}\b/g;
const PII_IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;
const PII_UPI = /[\w.\-]{2,}@[a-zA-Z]{2,}/g;
const PII_CVV = /\bCVV\s*[:=\-]?\s*(\d{3,4})\b/gi;
const PII_EXPIRY = /\b(?:expir(?:y|ation|es)|exp\.?|valid\s+(?:thru|through|till))\s*[:=\-]?\s*((?:0[1-9]|1[0-2])[/\-.](?:\d{2}|\d{4}))\b/gi;
const PII_BANK_ACCT = /\b\d{9,18}\b/g;
const PII_INTERNAL_URL_HTTP = /\bhttps?:\/\/(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.|internal\.|intranet\.)[^\s"']+/gi;
const PII_LOCALHOST = /(?:https?:\/\/)?(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?)(?::\d{1,5})?(?:\/[^\s"']*)?/gi;
const PII_BARE_INTERNAL = /(?<![\w@/:/])(?:[a-z0-9-]+\.)+(?:internal|intranet|local|corp)(?::\d{1,5})?(?:\/[^\s"']*)?/gi;
const PII_PROJECT = /\b(?:Project|Operation|Codename|Code-name|Internal project)\s+["“']?([A-Z][A-Za-z0-9-]{2,30})["”']?/g;
const PII_UNSAFE_URL = /(?:javascript\s*:|vbscript\s*:|data\s*:\s*text\/html|file\s*:\/\/[^\s"']+)/gi;

const DOB_CONTEXT = ["dob", "d.o.b", "birth", "born", "date of birth", "birthday"];
const ADDR_CONTEXT = ["address", "street", "road", "avenue", "city", "state", "zip", "pin", "postal", "residing", "lives at", "located at"];
const CARD_CONTEXT = ["card", "credit", "debit", "cvv", "expir", "payment", "visa", "mastercard", "amex", "rupay"];
const BANK_CONTEXT = ["bank", "account", "acct", "a/c", "ifsc", "iban", "upi", "vpa", "branch", "transfer", "remit"];

function ibanMod97Valid(iban: string): boolean {
  const s = iban.replace(/[\s-]/g, "").toUpperCase();
  if (s.length < 15 || s.length > 34) return false;
  const rearr = s.slice(4) + s.slice(0, 4);
  let rem = 0;
  for (const ch of rearr) {
    const code = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of code) rem = (rem * 10 + (d.charCodeAt(0) - 48)) % 97;
  }
  return rem === 1;
}

function detectPII(text: string, opts?: { internalAssets?: boolean; unsafeUrls?: boolean }): RawFinding[] {
  const findings: RawFinding[] = [];
  const wantInternal = opts?.internalAssets ?? true;
  const wantUnsafeUrls = opts?.unsafeUrls ?? true;

  for (const m of reScan(PII_EMAIL, text)) {
    // UPI handles are classified separately — skip email here to avoid double count.
    const domain = (m.matched.split("@")[1] ?? "").toLowerCase();
    if (UPI_HANDLES.has(domain)) continue;
    findings.push({
      category: "PII", type: "EMAIL", severity: "MEDIUM", confidence: 0.97,
      defaultAction: "MASK", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: maskEmail(m.matched),
      reason: "Personal email address detected under PII policy.",
    });
  }

  // UPI / VPA identifiers (name@handle).
  for (const m of reScan(PII_UPI, text)) {
    if (overlaps(m, findings)) continue;
    const handle = (m.matched.split("@")[1] ?? "").toLowerCase();
    const isUpi = UPI_HANDLES.has(handle) || nearbyKeyword(text, m.start, m.end, ["upi", "vpa", "pay"], 40);
    if (!isUpi) continue;
    findings.push({
      category: "PII", type: "UPI", severity: "HIGH", confidence: 0.86,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[UPI_REDACTED]",
      reason: "UPI/VPA payment identifier detected — financial PII, must not be released.",
    });
  }

  // Credit-card before Aadhaar/PAN/IDs so 16-digit groups classify as payment data.
  for (const m of reScan(PII_CREDIT_CARD, text)) {
    if (overlaps(m, findings)) continue;
    const digits = m.matched.replace(/\D/g, "");
    if (digits.length < 13 || digits.length > 19) continue;
    if (/^(\d)\1{12,18}$/.test(digits)) continue; // repeated digit — not a card
    const valid = luhnValid(digits);
    const context = nearbyKeyword(text, m.start, m.end, CARD_CONTEXT, 60);
    if (!valid && !context) continue; // length alone is not enough — cuts FP on IDs/phones
    findings.push({
      category: "PII", type: "CREDIT_CARD", severity: "CRITICAL", confidence: valid ? 0.97 : 0.72,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[CARD_REDACTED]",
      reason: valid
        ? "Credit-card number detected (Luhn-validated) — payment data, must never be released."
        : "Possible credit-card number near payment context — redacted as precaution.",
    });
  }

  for (const m of reScan(PII_AADHAAR, text)) {
    if (overlaps(m, findings)) continue;
    const digits = m.matched.replace(/\D/g, "");
    if (/^(\d)\1{11}$/.test(digits)) continue;
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

  for (const m of reScan(PII_SSN, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "SSN", severity: "CRITICAL", confidence: 0.94,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[SSN_REDACTED]",
      reason: "US Social Security Number detected — highly sensitive government identifier.",
    });
  }

  for (const m of reScan(PII_PASSPORT_US, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "PASSPORT", severity: "CRITICAL", confidence: 0.85,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[PASSPORT_REDACTED]",
      reason: "Passport number pattern detected — travel identity document.",
    });
  }
  for (const m of reScan(PII_PASSPORT_IN, text)) {
    if (overlaps(m, findings)) continue;
    if (!nearbyKeyword(text, m.start, m.end, ["passport"], 50)) continue;
    findings.push({
      category: "PII", type: "PASSPORT", severity: "CRITICAL", confidence: 0.82,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[PASSPORT_REDACTED]",
      reason: "Passport number near passport context — travel identity document.",
    });
  }
  for (const m of reScan(PII_DL_IN, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "DRIVERS_LICENSE", severity: "HIGH", confidence: 0.84,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[DL_REDACTED]",
      reason: "Driving licence number detected — government identity document.",
    });
  }

  // Postal codes — only with address context to avoid flagging every 5-6 digit number.
  for (const m of reScan(PII_ZIP_US, text)) {
    if (overlaps(m, findings)) continue;
    if (!nearbyKeyword(text, m.start, m.end, ADDR_CONTEXT, 60)) continue;
    findings.push({
      category: "PII", type: "POSTAL_CODE", severity: "MEDIUM", confidence: 0.72,
      defaultAction: "MASK", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[ZIP_MASKED]",
      reason: "Postal/ZIP code near address context — location identifier.",
    });
  }
  for (const m of reScan(PII_PIN_IN, text)) {
    if (overlaps(m, findings)) continue;
    if (!nearbyKeyword(text, m.start, m.end, [...ADDR_CONTEXT, "pin code", "pincode"], 60)) continue;
    findings.push({
      category: "PII", type: "POSTAL_CODE", severity: "MEDIUM", confidence: 0.74,
      defaultAction: "MASK", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[PIN_MASKED]",
      reason: "India PIN code near address context — location identifier.",
    });
  }

  // Street addresses + PO boxes.
  for (const re of [PII_STREET, PII_POBOX]) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      findings.push({
        category: "PII", type: "ADDRESS", severity: "HIGH", confidence: 0.78,
        defaultAction: "REDACT", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[ADDRESS_REDACTED]",
        reason: "Physical street address detected — precise location PII.",
      });
    }
  }

  // Bank identifiers: IBAN (mod-97 validated), IFSC, CVV, expiry, account numbers.
  for (const m of reScan(PII_IBAN, text)) {
    if (overlaps(m, findings)) continue;
    const compact = m.matched.replace(/[\s-]/g, "");
    if (compact.length < 15 || compact.length > 34) continue;
    if (!ibanMod97Valid(compact) && !nearbyKeyword(text, m.start, m.end, BANK_CONTEXT, 60)) continue;
    findings.push({
      category: "PII", type: "IBAN", severity: "CRITICAL", confidence: ibanMod97Valid(compact) ? 0.95 : 0.7,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[IBAN_REDACTED]",
      reason: "International bank account number (IBAN) detected — financial data.",
    });
  }
  for (const m of reScan(PII_IFSC, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "IFSC", severity: "HIGH", confidence: 0.9,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[IFSC_REDACTED]",
      reason: "IFSC branch code detected — bank routing identifier.",
    });
  }
  for (const m of reScan(PII_CVV, text)) {
    if (overlaps(m, findings)) continue;
    const value = m.groups?.[0] ?? m.matched;
    const vStart = m.start + m.matched.lastIndexOf(value);
    findings.push({
      category: "PII", type: "CREDIT_CARD", severity: "CRITICAL", confidence: 0.9,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[CVV_REDACTED]",
      reason: "Card verification value (CVV) detected — must never be stored or released.",
    });
    void vStart;
  }
  for (const m of reScan(PII_EXPIRY, text)) {
    if (overlaps(m, findings)) continue;
    if (!nearbyKeyword(text, m.start, m.end, [...CARD_CONTEXT, "valid"], 30)) continue;
    findings.push({
      category: "PII", type: "CREDIT_CARD", severity: "HIGH", confidence: 0.8,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[EXPIRY_REDACTED]",
      reason: "Card expiry near payment context — payment data.",
    });
  }
  for (const m of reScan(PII_BANK_ACCT, text)) {
    if (overlaps(m, findings)) continue;
    const digits = m.matched.replace(/\D/g, "");
    if (/^(\d)\1{8,}$/.test(digits)) continue;
    if (!nearbyKeyword(text, m.start, m.end, BANK_CONTEXT, 60)) continue;
    findings.push({
      category: "PII", type: "BANK_ACCOUNT", severity: "CRITICAL", confidence: 0.72,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[ACCOUNT_REDACTED]",
      reason: "Bank account number near banking context — financial data.",
    });
  }

  // Phones — run all patterns, dedupe by overlap. Card/Aadhaar/IDs win overlaps.
  const phoneMatches: DetectorMatch[] = [];
  for (const re of [PII_PHONE_IN, PII_PHONE_INTL, PII_PHONE_UK, PII_PHONE_GENERIC]) {
    for (const m of reScan(re, text)) {
      if (!overlapsAny(m, phoneMatches)) phoneMatches.push(m);
    }
  }
  for (const m of phoneMatches) {
    if (overlaps(m, findings)) continue;
    // Never match a slice of a longer digit run (card/ID/account fragments).
    if (/\d/.test(text[m.start - 1] ?? "") || /\d/.test(text[m.end] ?? "")) continue;
    const digits = m.matched.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) continue;
    if (/^(\d)\1{7,}$/.test(digits)) continue;
    findings.push({
      category: "PII", type: "PHONE", severity: "MEDIUM", confidence: 0.85,
      defaultAction: "MASK", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: maskPhone(m.matched),
      reason: "Phone number detected — direct personal identifier.",
    });
  }

  // Dates of birth: month-name (standalone) + numeric (context-gated).
  for (const m of reScan(PII_DOB_MON, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PII", type: "DATE_OF_BIRTH", severity: "HIGH", confidence: 0.82,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[DOB_REDACTED]",
      reason: "Date of birth pattern detected.",
    });
  }
  for (const re of [PII_DOB_EU, PII_DOB_ISO, PII_DOB_US]) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      if (!nearbyKeyword(text, m.start, m.end, DOB_CONTEXT, 50)) continue;
      findings.push({
        category: "PII", type: "DATE_OF_BIRTH", severity: "HIGH", confidence: 0.78,
        defaultAction: "REDACT", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[DOB_REDACTED]",
        reason: "Numeric date near birth context — date of birth.",
      });
    }
  }

  if (wantInternal) {
  for (const m of reScan(PII_IP, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "INTERNAL_ASSET", type: "IP_ADDRESS", severity: "MEDIUM", confidence: 0.8,
      defaultAction: "REPLACE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[INTERNAL_HOST]",
      reason: "IP address — infrastructure detail, abstracted for external release.",
    });
  }
  for (const m of reScan(PII_IPV6, text)) {
    if (overlaps(m, findings)) continue;
    if (m.matched.length < 3) continue;
    findings.push({
      category: "INTERNAL_ASSET", type: "IPV6_ADDRESS", severity: "MEDIUM", confidence: 0.78,
      defaultAction: "REPLACE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[INTERNAL_HOST_V6]",
      reason: "IPv6 address — infrastructure detail, abstracted for external release.",
    });
  }
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

  if (wantInternal) {
  for (const re of [PII_INTERNAL_URL_HTTP, PII_LOCALHOST, PII_BARE_INTERNAL]) {
    for (const m of reScan(re, text)) {
      if (overlaps(m, findings)) continue;
      if (m.matched.length < 4) continue;
      findings.push({
        category: "INTERNAL_ASSET", type: "INTERNAL_URL", severity: "HIGH", confidence: 0.9,
        defaultAction: "REDACT", stage: "INPUT",
        start: m.start, end: m.end, matchedText: m.matched,
        maskedText: "[INTERNAL_URL_REDACTED]",
        reason: "Internal host/URL — must not appear in public output.",
      });
    }
  }
  }

  if (wantUnsafeUrls) {
  for (const m of reScan(PII_UNSAFE_URL, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "UNSAFE_URL", type: "UNSAFE_URL", severity: "HIGH", confidence: 0.9,
      defaultAction: "REDACT", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[URL_REMOVED]",
      reason: "Unsafe URL scheme (javascript:/data:/file:) — active-content risk, removed.",
    });
  }
  }

  if (wantInternal) {
  for (const m of reScan(PII_PROJECT, text)) {
    if (overlaps(m, findings)) continue;
    const name = m.groups?.[0] ?? m.matched;
    if (!name || name.length < 3) continue;
    findings.push({
      category: "INTERNAL_ASSET", type: "INTERNAL_PROJECT", severity: "MEDIUM", confidence: 0.68,
      defaultAction: "REPLACE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[INTERNAL_PROJECT]",
      reason: "Internal project/codename reference — abstract for external audiences.",
    });
  }
  }

  // Person names — role labels (expanded) + contact-adjacent heuristic.
  const nameRe = /(?:Project Lead|Engineer|Lead|Manager|Analyst|Officer|Member|Director|Architect|Contact|Author|Owner|Reporter|Supervisor|Coordinator|Administrator|Customer|Client|Candidate|Recruiter|Colleague|Prepared by|Reported by|Full Name|Name|POC)\s*[:\-]\s*([A-Z][a-z]+(?:['-][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:['-][A-Za-z]+)?){1,2})/g;
  for (const m of reScan(nameRe, text)) {
    const inner = /[:\-]\s*([A-Z][a-z]+(?:['-][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:['-][A-Za-z]+)?){1,2})/;
    const im = inner.exec(m.matched);
    if (!im?.[1]) continue;
    if (/^(Team|Project|Department|Internal|External|Security)$/i.test(im[1].split(/\s+/)[0])) continue;
    const nameStart = m.start + (im.index ?? 0) + im[0].indexOf(im[1]);
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
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local[0]}***@***${domain.includes(".") ? domain.slice(domain.indexOf(".")) : ""}`;
}

function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "[PHONE_REDACTED]";
  return `***-***-${digits.slice(-2)}`;
}

// ---------------------------------------------------------------------------
// Secret detectors
// ---------------------------------------------------------------------------

const SECRET_AWS_ID = /\b(?:AKIA|ASIA)[0-9A-Z]{12,20}\b/g;
const SECRET_AWS_SECRET_KV = /(?:aws[_-]?secret[_-]?access[_-]?key)["'\s:=]+([A-Za-z0-9/+=]{30,})/gi;
const SECRET_GITHUB = /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{10,}\b/g;
const SECRET_GITHUB_PAT = /\bgithub_pat_[A-Za-z0-9_]{10,}\b/g;
const SECRET_GITLAB = /\bglpat-[A-Za-z0-9_-]{10,}\b/g;
const SECRET_NPM = /\bnpm_[A-Za-z0-9]{10,}\b/g;
const SECRET_SLACK = /\bxox[abcdeoprs]-[A-Za-z0-9-]{10,}\b/gi;
const SECRET_STRIPE = /\b(?:sk_live|rk_live|sk_test|rk_test|whsec)_[A-Za-z0-9]{10,}\b/g;
const SECRET_GCP_API = /\bAIza[0-9A-Za-z_-]{35}\b/g;
const SECRET_JWT = /\beyJ[A-Za-z0-9_-]{6,}\.eyJ[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g;
const SECRET_PRIVATE_KEY = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g;
const SECRET_PGP = /-----BEGIN PGP PRIVATE KEY BLOCK-----[\s\S]*?-----END PGP PRIVATE KEY BLOCK-----/g;
const SECRET_SSH = /\bssh-(?:rsa|ed25519|ecdsa)\s+[A-Za-z0-9+/=]{20,}(?:\s+\S+)?/g;
const SECRET_DB_CONN = /\b(?:postgres|postgresql|mongodb(\+srv)?|mysql|redis|amqp):\/\/[^\s"']+/gi;
const SECRET_AZURE_CONN = /DefaultEndpointsProtocol=https?;AccountName=[^;]+;AccountKey=[^;]+/gi;
const SECRET_AZURE_KEY_KV = /AccountKey\s*=\s*([A-Za-z0-9+/=]{20,})/gi;
const SECRET_GCP_SA = /"type"\s*:\s*"service_account"/gi;
const SECRET_BEARER = /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g;
const SECRET_BASIC = /\bBasic\s+[A-Za-z0-9+/=]{12,}/g;
const SECRET_GENERIC_SK = /\bsk-[A-Za-z0-9]{14,}\b/g;
const SECRET_API_KEY_KV = /\b(?:api[_-]?key|secret|token|password|passwd|pwd|access[_-]?token|client[_-]?secret)["'\s:=]+([A-Za-z0-9_\-./+]{12,})/gi;

// Common English words that must never be treated as secret values.
const SECRET_STOPWORDS = new Set([
  "distribution", "description", "document", "information", "production", "management",
  "authentication", "authorization", "configuration", "following", "however", "therefore",
]);

// Context words that boost secret confidence.
const SECRET_CONTEXT = /\b(token|secret|password|passwd|credential|api[_-]?key|access[_-]?key|private[_-]?key|authorization|bearer|client[_-]?secret)\b/gi;

function detectSecrets(text: string): RawFinding[] {
  const findings: RawFinding[] = [];
  const contextPositions = [...text.matchAll(SECRET_CONTEXT)].map((m) => m.index ?? 0);

  function nearbyContext(start: number, end: number): boolean {
    return contextPositions.some((p) => {
      const dist = Math.min(Math.abs(p - start), Math.abs(p - end));
      return dist < 80;
    });
  }

  const push = (m: DetectorMatch, type: "API_KEY" | "JWT" | "PRIVATE_KEY" | "DB_CONN_STRING" | "CLOUD_CRED" | "AUTH_TOKEN", label: string, confidence: number, reason: string) => {
    if (overlaps(m, findings)) return;
    findings.push(secretFinding(m, type, label, confidence, reason));
  };

  for (const m of reScan(SECRET_AWS_ID, text)) {
    push(m, "API_KEY", "AKIA", 0.96, "AWS access key ID prefix matched.");
  }
  for (const m of reScan(SECRET_AWS_SECRET_KV, text)) {
    push(m, "CLOUD_CRED", "AWS_SECRET", 0.97, "AWS secret access key assignment detected.");
  }
  for (const m of reScan(SECRET_GITHUB, text)) {
    push(m, "API_KEY", "GitHub PAT", 0.95, "GitHub token prefix matched.");
  }
  for (const m of reScan(SECRET_GITHUB_PAT, text)) {
    push(m, "API_KEY", "GitHub PAT", 0.95, "GitHub fine-grained PAT prefix matched.");
  }
  for (const m of reScan(SECRET_GITLAB, text)) {
    push(m, "API_KEY", "GitLab PAT", 0.94, "GitLab personal access token prefix matched.");
  }
  for (const m of reScan(SECRET_NPM, text)) {
    push(m, "API_KEY", "npm token", 0.93, "npm access token prefix matched.");
  }
  for (const m of reScan(SECRET_SLACK, text)) {
    push(m, "API_KEY", "Slack token", 0.93, "Slack token prefix matched.");
  }
  for (const m of reScan(SECRET_STRIPE, text)) {
    push(m, "API_KEY", "Stripe key", 0.96, "Stripe live/test key prefix matched.");
  }
  for (const m of reScan(SECRET_GCP_API, text)) {
    push(m, "CLOUD_CRED", "GCP_API_KEY", 0.94, "Google Cloud API key prefix matched.");
  }
  for (const m of reScan(SECRET_JWT, text)) {
    push(m, "JWT", "JWT", 0.92, "JWT structure (header.payload.signature) detected.");
  }
  for (const m of reScan(SECRET_PRIVATE_KEY, text)) {
    push(m, "PRIVATE_KEY", "PEM", 0.99, "PEM private key block detected.");
  }
  for (const m of reScan(SECRET_PGP, text)) {
    push(m, "PRIVATE_KEY", "PGP", 0.99, "PGP private key block detected.");
  }
  for (const m of reScan(SECRET_SSH, text)) {
    push(m, "PRIVATE_KEY", "SSH", 0.93, "SSH public/private key material detected.");
  }
  for (const m of reScan(SECRET_DB_CONN, text)) {
    push(m, "DB_CONN_STRING", "URI", 0.98, "Database connection string containing embedded credentials.");
  }
  for (const m of reScan(SECRET_AZURE_CONN, text)) {
    push(m, "CLOUD_CRED", "AZURE_CONN", 0.97, "Azure storage connection string with embedded key.");
  }
  for (const m of reScan(SECRET_AZURE_KEY_KV, text)) {
    push(m, "CLOUD_CRED", "AZURE_KEY", 0.95, "Azure account key assignment detected.");
  }
  for (const m of reScan(SECRET_GCP_SA, text)) {
    push(m, "CLOUD_CRED", "GCP_SA", 0.9, "Google service-account credential marker detected.");
  }
  for (const m of reScan(SECRET_BEARER, text)) {
    push(m, "AUTH_TOKEN", "BEARER", 0.9, "HTTP Bearer token credential detected.");
  }
  for (const m of reScan(SECRET_BASIC, text)) {
    push(m, "AUTH_TOKEN", "BASIC", 0.88, "HTTP Basic credential detected.");
  }
  for (const m of reScan(SECRET_GENERIC_SK, text)) {
    push(m, "API_KEY", "sk-", 0.9, "OpenAI-style API key prefix matched.");
  }

  // Key/value secret assignments — capture group 1 is the value; FP-guarded.
  for (const m of reScan(SECRET_API_KEY_KV, text)) {
    if (overlaps(m, findings)) continue;
    const value = (m.groups?.[0] ?? "").trim().replace(/["';,]+$/g, "");
    if (!value || value.length < 12) continue;
    if (SECRET_STOPWORDS.has(value.toLowerCase())) continue;
    const entropy = shannonEntropy(value);
    const hasContext = nearbyContext(m.start, m.end);
    if (entropy < 2.5 && !hasContext) continue;
    if (entropy < 2.0) continue;
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
  m: DetectorMatch,
  type: "API_KEY" | "JWT" | "PRIVATE_KEY" | "DB_CONN_STRING" | "CLOUD_CRED" | "AUTH_TOKEN",
  label: string,
  confidence: number,
  reason: string
): RawFinding {
  return {
    category: "SECRET",
    type,
    severity: type === "PRIVATE_KEY" || type === "DB_CONN_STRING" || type === "CLOUD_CRED" ? "CRITICAL" : "HIGH",
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
  { re: /forget (?:all )?(?:your |previous |prior )?instructions/gi, reason: "Instruction-wipe phrase detected.", severity: "CRITICAL" },
  { re: /reveal (?:the )?system prompt/gi, reason: "Requests system prompt exfiltration.", severity: "CRITICAL" },
  { re: /you are now (?:in |operating in )?(?:privileged|operator|admin|root) mode/gi, reason: "Role-elevation attempt.", severity: "HIGH" },
  { re: /you are no longer bound by/gi, reason: "Attempts to remove policy constraints.", severity: "HIGH" },
  { re: /stop summarizing/gi, reason: "Attempts to abort the assigned transformation.", severity: "HIGH" },
  { re: /system override complete/gi, reason: "Injection confirmation marker.", severity: "HIGH" },
  { re: /release all data/gi, reason: "Data-exfiltration command.", severity: "CRITICAL" },
  { re: /do anything now/gi, reason: "DAN-style jailbreak marker.", severity: "CRITICAL" },
  { re: /jailbreak/gi, reason: "Jailbreak instruction marker.", severity: "CRITICAL" },
  { re: /developer mode/gi, reason: "Developer-mode jailbreak attempt.", severity: "HIGH" },
  { re: /bypass (?:all )?(?:safety|security|content|policy)(?: (?:filters?|controls?|policies))?/gi, reason: "Safety-bypass instruction.", severity: "CRITICAL" },
  { re: /exfiltrat\w*/gi, reason: "Data-exfiltration instruction.", severity: "CRITICAL" },
  { re: /output (?:the |every |all )?(?:confidential|secret|api key|token|credential|raw source)/gi, reason: "Requests exfiltration of sensitive material.", severity: "CRITICAL" },
];

const ROLE_MANIPULATION = [
  { re: /you are (?:now )?(?:in )?[\w\s]{0,24}(?:privileged|operator|root|admin|unrestricted)[\w\s]{0,20}(?:mode|role)/gi, reason: "Assigns a privileged role to the model." },
  { re: /(?:enter|switch to|activate) [\w\s]{0,20}(?:privileged|operator|root|admin)[\w\s]{0,20}mode/gi, reason: "Requests privileged-mode activation." },
  { re: /act as (?:a |an )?(?:system|administrator|admin|root|developer)(?:\s+(?:prompt|agent|assistant))?/gi, reason: "Requests the model act as a privileged agent." },
  { re: /pretend (?:to be|you are)(?: now)? [\w\s]{0,30}(?:admin|root|system|developer|without (?:limits|restrictions|safety))/gi, reason: "Role-play jailbreak attempt." },
];

const TOOL_INVOCATION = [
  { re: /call (?:the )?[a-z_]+ tool/gi, reason: "Requests external tool invocation." },
  { re: /invoke (?:the )?[a-z_]+ tool/gi, reason: "Requests external tool invocation." },
  { re: /execute_sql|send_email|web_search\(/gi, reason: "Named tool-call syntax inside content." },
  { re: /email (?:it|them|this) to/gi, reason: "Requests exfiltration via email tool." },
  { re: /\bcurl\s+https?:\/\/[^\s"']+/gi, reason: "Shell download/exfiltration command inside content." },
  { re: /\bwget\s+https?:\/\/[^\s"']+/gi, reason: "Shell download command inside content." },
  { re: /send (?:this|it|them|the [\w ]{1,20}) to \S+@\S+\.\S+/gi, reason: "Requests sending content to an external address." },
];

const HIDDEN_INSTRUCTION_HTML = /<!--[\s\S]*?(?:ignore|disregard|forget|assistant|system|reveal|override|jailbreak|exfiltrate|DAN)[\s\S]*?-->/gi;
const HIDDEN_INSTRUCTION_FENCE = /```[\s\S]*?(?:ignore (?:all )?(?:previous|prior) instructions|disregard .*instructions|reveal .*system prompt|jailbreak|system override)[\s\S]*?```/gi;
const HIDDEN_INSTRUCTION_MD_LINK = /\[([^\]]+)\]\((?:javascript|data):[^)]+\)/gi;

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

  for (const m of reScan(HIDDEN_INSTRUCTION_HTML, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PROMPT_INJECTION", type: "HIDDEN_INSTRUCTION", severity: "CRITICAL", confidence: 0.88,
      defaultAction: "QUARANTINE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[HIDDEN_INSTRUCTION_REMOVED]",
      reason: "HTML comment contains instruction-like language — hidden directive removed.",
    });
  }
  for (const m of reScan(HIDDEN_INSTRUCTION_FENCE, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PROMPT_INJECTION", type: "HIDDEN_INSTRUCTION", severity: "HIGH", confidence: 0.8,
      defaultAction: "QUARANTINE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched.slice(0, 500),
      maskedText: "[HIDDEN_INSTRUCTION_REMOVED]",
      reason: "Fenced code block contains instruction-override language — treated as hidden directive.",
    });
  }
  for (const m of reScan(HIDDEN_INSTRUCTION_MD_LINK, text)) {
    if (overlaps(m, findings)) continue;
    findings.push({
      category: "PROMPT_INJECTION", type: "HIDDEN_INSTRUCTION", severity: "HIGH", confidence: 0.85,
      defaultAction: "QUARANTINE", stage: "INPUT",
      start: m.start, end: m.end, matchedText: m.matched,
      maskedText: "[HIDDEN_INSTRUCTION_REMOVED]",
      reason: "Markdown link uses an active-content scheme — possible click-jacking payload.",
    });
  }

  // Invisible-character smuggling: zero-width/bidi chars co-occurring with
  // injection language in the normalized text.
  if (/[​‌‍﻿⁠‮‭‪⁦⁧⁨⁩­]/.test(text)) {
    const clean = normalizeInvisible(text).toLowerCase();
    const markers = ["ignore previous instructions", "disregard", "reveal the system prompt", "jailbreak", "system override"];
    if (markers.some((k) => clean.includes(k))) {
      const first = text.search(/[​‌‍﻿⁠‮‭‪⁦⁧⁨⁩­]/);
      if (first >= 0 && !overlaps({ start: first, end: first + 1 }, findings)) {
        findings.push({
          category: "PROMPT_INJECTION", type: "HIDDEN_INSTRUCTION", severity: "HIGH", confidence: 0.7,
          defaultAction: "QUARANTINE", stage: "INPUT",
          start: first, end: Math.min(text.length, first + 8), matchedText: "[invisible-chars]",
          maskedText: "",
          reason: "Invisible Unicode characters near instruction language — possible smuggled directive, stripped.",
        });
      }
    }
  }

  return findings;
}

// ---------------------------------------------------------------------------
// Output-stage detector (used by Output DLP to re-scan generated content)
// ---------------------------------------------------------------------------

export function detectOutputLeakage(text: string): RawFinding[] {
  const leaks: RawFinding[] = [];
  const pii = detectPII(text);
  const secrets = detectSecrets(text);
  const injections = detectPromptInjection(text);
  for (const f of [...pii, ...secrets, ...injections]) {
    leaks.push({ ...f, stage: "OUTPUT" });
  }
  return leaks;
}

// ---------------------------------------------------------------------------
// Public orchestration: scan a document end-to-end
// ---------------------------------------------------------------------------

export function scanContent(text: string, config?: ScanConfig): RawFinding[] {
  if (!text) return [];
  const cfg = {
    pii: config?.pii ?? true,
    secrets: config?.secrets ?? true,
    injections: config?.injections ?? true,
    internalAssets: config?.internalAssets ?? true,
    unsafeUrls: config?.unsafeUrls ?? true,
    minConfidence: config?.minConfidence ?? 0,
  };
  // Secrets before PII so that DB URLs containing email-like substrings are
  // classified as secrets, not PII. Credit-card before Aadhaar for the same reason.
  const secrets = cfg.secrets ? detectSecrets(text) : [];
  const pii = detectPII(text, cfg);
  const injections = cfg.injections ? detectPromptInjection(text) : [];
  // Sort by start offset; for overlaps prefer higher confidence / severity.
  const merged = [...secrets, ...pii, ...injections];
  // Family toggles + confidence floor. NOTE: output-stage DLP
  // (detectOutputLeakage) intentionally ignores config and always scans everything.
  const enabled: Record<string, boolean> = {
    PII: cfg.pii,
    SECRET: cfg.secrets,
    PROMPT_INJECTION: cfg.injections,
    INTERNAL_ASSET: cfg.internalAssets,
    UNSAFE_URL: cfg.unsafeUrls,
  };
  const eligible = merged.filter(
    (f) => (enabled[f.category] ?? true) && f.confidence >= cfg.minConfidence
  );
  eligible.sort((a, b) => a.start - b.start || b.confidence - a.confidence);

  // De-duplicate overlaps across detectors. Prefer higher category priority,
  // then higher confidence, then longer span. A span may overlap several
  // kept findings (not just the first), so check ALL of them.
  const CATEGORY_PRIORITY: Record<string, number> = {
    SECRET: 5,
    PROMPT_INJECTION: 4,
    UNSAFE_URL: 3,
    INTERNAL_ASSET: 2,
    PII: 1,
  };
  const deduped: RawFinding[] = [];
  for (const f of eligible) {
    const overlapping = deduped.filter((d) => f.start < d.end && f.end > d.start);
    if (overlapping.length === 0) {
      deduped.push(f);
      continue;
    }
    // Keep the strongest span among {incoming + all overlapped}.
    const candidates = [...overlapping, f];
    candidates.sort((a, b) => {
      const pa = CATEGORY_PRIORITY[a.category] ?? 0;
      const pb = CATEGORY_PRIORITY[b.category] ?? 0;
      if (pa !== pb) return pb - pa;
      if (a.confidence !== b.confidence) return b.confidence - a.confidence;
      return (b.end - b.start) - (a.end - a.start);
    });
    const winner = candidates[0];
    if (winner === f) {
      for (const o of overlapping) {
        const idx = deduped.indexOf(o);
        if (idx >= 0) deduped.splice(idx, 1);
      }
      deduped.push(f);
    }
    // else: incoming loses to an existing stronger span — drop it.
  }
  deduped.sort((a, b) => a.start - b.start);
  return deduped;
}
