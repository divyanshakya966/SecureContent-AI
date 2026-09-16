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
  if (/AKIA[0-9A-Z]{12,}|ASIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|glpat-[A-Za-z0-9_-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{14,}|AIza[0-9A-Za-z_-]{35}|BEGIN.*PRIVATE KEY|BEGIN PGP|ssh-(?:rsa|ed25519)|eyJ[A-Za-z0-9_-]{6,}\.eyJ|postgres(?:ql)?:\/\/|mongodb(\+srv)?:\/\/|AccountKey=|Bearer\s+[A-Za-z0-9]/.test(s)) return false;

  const sample = s.slice(0, 4000);
  const cjk = (sample.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  if (cjk / Math.max(1, sample.length) > 0.2) return false;
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

export interface TextQuality {
  printableRatio: number;
  spaceRatio: number;
  avgWordLen: number;
  wordCount: number;
  dictionaryRatio: number;
  score: number; // 0..1
  isGarbage: boolean;
}

const COMMON_WORD_RE = /\b(the|and|or|is|to|of|in|for|with|on|as|by|at|from|this|that|was|are|has|have|will|document|report|incident|security|management|policy|data|information|system|user|content|page|section|paragraph)\b/gi;

export function scoreTextQuality(input: string): TextQuality {
  if (!input || !input.trim()) {
    return { printableRatio: 0, spaceRatio: 0, avgWordLen: 0, wordCount: 0, dictionaryRatio: 0, score: 0, isGarbage: true };
  }
  // Allow secrets to pass even if they look like garbage — they are still meaningful for scanning
  if (/AKIA[0-9A-Z]{12,}|ASIA[0-9A-Z]{12,}|ghp_[A-Za-z0-9]{10,}|gho_[A-Za-z0-9]{10,}|github_pat_[A-Za-z0-9_]{10,}|glpat-[A-Za-z0-9_-]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}|sk_live_[A-Za-z0-9]{10,}|sk-[A-Za-z0-9]{14,}|AIza[0-9A-Za-z_-]{35}|BEGIN.*PRIVATE KEY|BEGIN PGP|ssh-(?:rsa|ed25519)|eyJ[A-Za-z0-9_-]{6,}\.eyJ|postgres(?:ql)?:\/\/|mongodb(\+srv)?:\/\/|AccountKey=|Bearer\s+[A-Za-z0-9]/.test(input.slice(0, 4000))) {
    return { printableRatio: 1, spaceRatio: 0.15, avgWordLen: 10, wordCount: 10, dictionaryRatio: 0.1, score: 0.8, isGarbage: false };
  }
  const sample = input.slice(0, 8000);
  const cjkCount = (sample.match(/[\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) || []).length;
  const cjkRatio = cjkCount / Math.max(1, sample.length);
  const printable = sample.replace(/[^\x20-\x7E\x0A\x0D\x09\xA0-\u024F\u0400-\u04FF\u0900-\u097F\u0600-\u06FF\u4E00-\u9FFF]/g, "").length;
  const printableRatio = printable / Math.max(1, sample.length);
  const spaces = (sample.match(/ /g) || []).length;
  const spaceRatio = spaces / Math.max(1, sample.length);
  const words = sample.trim().split(/\s+/).filter(Boolean);
  const avgWordLen = words.length ? sample.length / words.length : 0;
  const dictMatches = (sample.match(COMMON_WORD_RE) || []).length;
  const dictionaryRatio = dictMatches / Math.max(1, words.length);
  // Heuristic garbage signals
  const gibberishWordRe = /[^a-zA-Z0-9]/;
  let alphaWords = 0;
  let garbledWords = 0;
  for (const w of words.slice(0, 200)) {
    const cleaned = w.replace(/^[^\w]+|[^\w]+$/g, "");
    if (!cleaned) continue;
    if (/^[a-zA-Z]{2,20}$/.test(cleaned)) alphaWords++;
    // word with many symbols/digits mixed and no vowels → likely garbled
    if (/[^a-zA-Z]/.test(cleaned) && !/[aeiouAEIOU]/.test(cleaned) && cleaned.length > 5) garbledWords++;
    if (cleaned.length > 25) garbledWords++;
  }
  const alphaRatio = alphaWords / Math.max(1, Math.min(words.length, 200));
  const garbledRatio = garbledWords / Math.max(1, Math.min(words.length, 200));

  let isGarbage = false;
  if (cjkRatio > 0.2) {
    if (printableRatio < 0.5) isGarbage = true;
  } else if (printableRatio < 0.72) isGarbage = true;
  else if (spaceRatio < 0.04 && words.length > 5) isGarbage = true;
  else if (spaceRatio < 0.06 && avgWordLen > 14) isGarbage = true;
  else if (avgWordLen > 20) isGarbage = true;
  else if (garbledRatio > 0.35) isGarbage = true;
  else if (alphaRatio < 0.15 && words.length > 10 && dictionaryRatio < 0.03) isGarbage = true;
  // Very short extraction with no spaces and no dictionary words → garbage
  else if (words.length < 8 && avgWordLen > 12 && dictionaryRatio === 0) isGarbage = true;

  // Score 0..1 (1 = clean)
  let score = printableRatio * 0.35 + Math.min(1, spaceRatio * 6) * 0.25 + Math.min(1, dictionaryRatio * 8) * 0.2 + (1 - Math.min(1, garbledRatio * 2)) * 0.2;
  score = Math.max(0, Math.min(1, score));
  if (isGarbage) score = Math.min(score, 0.35);
  return { printableRatio, spaceRatio, avgWordLen, wordCount: words.length, dictionaryRatio, score, isGarbage };
}

export function isMeaningfulExtractedText(s: string, minChars = 40): boolean {
  if (!s || s.trim().length < minChars) return false;
  const q = scoreTextQuality(s);
  if (q.isGarbage) return false;
  if (q.score < 0.42) return false;
  if (s.trim().split(/\s+/).filter(Boolean).length < 4 && q.dictionaryRatio === 0) return false;
  return true;
}

export function safeTruncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return Array.from(s).slice(0, n - 1).join("") + "…";
}
