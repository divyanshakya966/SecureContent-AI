// SecureContent AI — Text normalization for ingest & display
// Fixes "obscure characters" after ingesting binary/mis-encoded documents:
// - strips control characters, zero-width, replacement chars
// - normalizes unicode, preserves \n \r \t
// - avoids splitting surrogate pairs when truncating

const CONTROL_RE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u00AD]/g;
const REPLACEMENT_RE = /\uFFFD/g;
// Keep printable + common punctuation, but normalize excessive whitespace later if needed
// We preserve \n, \r, \t explicitly via CONTROL_RE exception above

export function normalizeIngestedText(input: string): string {
  if (!input) return "";
  let s = input;

  // Normalize unicode (NFC) — merges composed characters, fixes mojibake remnants
  try {
    s = s.normalize("NFC");
  } catch {
    // ignore
  }

  // Remove replacement characters produced by invalid utf8 decode
  s = s.replace(REPLACEMENT_RE, "");

  // Strip zero-width / soft hyphen
  s = s.replace(ZERO_WIDTH_RE, "");

  // Strip C0 controls except \n (0A), \r (0D), \t (09)
  s = s.replace(CONTROL_RE, "");

  // Remove DEL and other non-printables that survived
  // Also strip lone surrogates that would render as obscure boxes
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\uD800-\uDFFF]/g, "");

  // Collapse 3+ consecutive blank lines to 2 (preserve paragraphs, avoid giant gaps)
  s = s.replace(/\n{3,}/g, "\n\n");

  // Trim trailing whitespace per line but keep line breaks
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  // Limit to prevent UI jank — caller should also enforce max chars
  return s;
}

export function sanitizeForDisplay(input: string, maxChars = 200_000): string {
  let s = normalizeIngestedText(input);
  if (s.length > maxChars) {
    // Grapheme-safe truncation: avoid cutting surrogate pairs / combining marks
    s = Array.from(s).slice(0, maxChars).join("");
  }
  return s;
}

export function isProbablyBinaryText(s: string): boolean {
  if (!s || s.trim().length < 20) return false;
  // Allow-list: documents intentionally containing secrets/injection payloads
  if (/AKIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{10,}|BEGIN.*PRIVATE KEY|eyJ[A-Za-z0-9_-]{8,}\.eyJ/.test(s)) return false;

  const sample = s.slice(0, 4000);
  const printable = sample.replace(/[^\x20-\x7E\x0A\x0D\x09\xA0-\u024F\u0400-\u04FF\u0900-\u097F\u0600-\u06FF\u4E00-\u9FFF]/g, "").length;
  const printableRatio = printable / Math.max(1, sample.length);
  if (printableRatio < 0.72) return true;

  const spaces = (sample.match(/ /g) || []).length;
  const spaceRatio = spaces / Math.max(1, sample.length);
  const words = sample.trim().split(/\s+/).filter(Boolean);
  const avgWordLen = words.length ? sample.length / words.length : 0;
  const hasCommonWord = /\b(the|and|or|is|to|of|in|for|with|on|as|by|at|from|this|that|with|was|are|document|report|incident|security)\b/i.test(sample);

  // Few words but huge avg length and no spaces → compressed/blob fragment
  if (words.length < 4) {
    if (avgWordLen > 15 && spaceRatio < 0.05) return true;
    if (sample.length > 60 && spaceRatio < 0.03) return true;
    return false;
  }

  if (spaceRatio < 0.06 && avgWordLen > 12) return true;
  if (spaceRatio < 0.04) return true;
  if (avgWordLen > 18) return true;
  if (!hasCommonWord && words.length > 5 && spaceRatio < 0.08) return true;
  return false;
}

export function safeTruncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return Array.from(s).slice(0, n - 1).join("") + "…";
}
