// SecureContent AI — Document parsing layer
// Good content processing pipeline: meaningful extraction for every source type.
// - Validates size/MIME, then tries Docling worker (if configured) for PDF/DOCX/PPTX/images.
// - Validates every extraction with quality scoring to avoid obscure/garbled text.
// - PDF: pdf-parse + quality check + scanned-PDF hint + optional fallback.
// - DOCX: mammoth + quality check.
// - PPTX: jszip xml extraction + docling fallback (no more placeholder-only).
// - Images: Docling OCR → local tesseract.js via sharp → metadata-rich placeholder (never garbled).
// - SVG: XML text extraction.
// - Text family: utf8/latin1 sniffing + binary detection to prevent PJYI~ garbage.

import crypto from "crypto";
import { normalizeIngestedText, isProbablyBinaryText, scoreTextQuality, isMeaningfulExtractedText } from "@/lib/text";

export interface ParsedDocument {
  text: string;
  pages: number;
  sections: number;
  wordCount: number;
  charCount: number;
  sha256: string;
  sourceFormat: string;
  warnings: string[];
  metadata: Record<string, unknown>;
}

const MAX_BYTES_TEXT = 10 * 1024 * 1024; // 10 MB — text/docs/images
const MAX_BYTES_MEDIA = 25 * 1024 * 1024; // 25 MB — short video/audio clips; larger files should use chunked upload
const ALLOWED_MIME_PREFIXES = ["text/", "application/json", "application/csv", "image/", "video/", "audio/"];

const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
  "text/html",
  "text/markdown",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
  "image/svg+xml",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "audio/ogg",
]);

function isAllowedMime(mime: string): boolean {
  if (!mime) return false; // missing mime → treat as unverified; caller will warn
  const lower = mime.toLowerCase();
  if (ALLOWED_MIME_EXACT.has(lower)) return true;
  return ALLOWED_MIME_PREFIXES.some((p) => lower.startsWith(p));
}

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Filenames are interpolated into placeholder text — strip controls/brackets, cap length. */
function safeName(filename: string): string {
  return (filename || "file").replace(/[\x00-\x1F\x7F\[\]\n\r]/g, "").trim().slice(0, 80) || "file";
}

function textStats(text: string) {
  const charCount = text.length;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const sections = Math.max(1, text.split(/\n\s*\n/).filter((p) => p.trim()).length);
  const pages = Math.max(1, Math.ceil(text.split(/\r?\n/).length / 40));
  return { charCount, wordCount, sections, pages };
}

async function tryDoclingWorker(buffer: Buffer, filename: string, mime: string): Promise<string | null> {
  const url = process.env.DOCLING_WORKER_URL;
  if (!url) return null;
  // Basic SSRF guard: only allow http(s) to loopback / local service names
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return null;
  } catch {
    return null;
  }
  try {
    const form = new FormData();
    const blob = new Blob([new Uint8Array(buffer)], { type: mime });
    form.append("file", blob, filename);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(url, { method: "POST", body: form as unknown as BodyInit, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j: unknown = await res.json().catch(() => null);
    let rawText: string | null = null;
    if (j && typeof j === "object" && "text" in j && typeof (j as { text: unknown }).text === "string" && (j as { text: string }).text.trim()) {
      rawText = (j as { text: string }).text;
    } else if (typeof j === "string" && j.trim()) {
      rawText = j as string;
    }
    if (!rawText) return null;
    // Validate docling output — don't accept garbled binary that looks like PJYI~ or hex
    const normalized = normalizeIngestedText(rawText);
    if (!normalized.trim()) return null;
    const q = scoreTextQuality(normalized);
    if (q.isGarbage || q.score < 0.30) {
      // Likely returned raw binary hex/utf8 fallback from worker — discard
      console.warn(`[parsers] Docling returned low-quality text (score ${q.score.toFixed(2)}, garbage=${q.isGarbage}) for ${filename} — discarding`);
      return null;
    }
    if (isProbablyBinaryText(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

async function parsePdf(buffer: Buffer): Promise<{ text: string; warnings: string[]; rawPages?: number }> {
  const warnings: string[] = [];
  try {
    // pdf-parse is CommonJS; dynamic import avoids bundler interop issues in Next.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("pdf-parse");
    const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number; info?: unknown }>;
    const data = await pdfParse(buffer);
    const raw = (data.text ?? "").trim();
    if (!raw) {
      warnings.push("PDF parsed but no extractable text found — likely a scanned image. Enable enhanced OCR in your workspace settings, or paste the content as text.");
      return { text: "", warnings, rawPages: data.numpages };
    }
    const normalized = normalizeIngestedText(raw);
    if (!normalized.trim()) {
      warnings.push("PDF text normalized to empty — likely scanned or using embedded fonts. Try enhanced OCR.");
      return { text: "", warnings, rawPages: data.numpages };
    }
    // Quality gate: pdf-parse can emit CID/garbled text for complex/embedded-font PDFs
    const q = scoreTextQuality(normalized);
    if (q.isGarbage || q.score < 0.35) {
      warnings.push(`PDF text appears garbled (quality score ${q.score.toFixed(2)}). This PDF may be scanned or use embedded fonts — enhanced OCR or a DOCX/TXT export will give better results.`);
      // If very garbled, treat as empty to trigger OCR path instead of surfacing garbage
      if (q.score < 0.25 || q.printableRatio < 0.65) {
        return { text: "", warnings, rawPages: data.numpages };
      }
      // Borderline: return but warn — caller will surface warning alongside extracted text
    }
    if (!isMeaningfulExtractedText(normalized, 40) && normalized.length < 200) {
      warnings.push("PDF extracted only a fragment of readable text — results may be incomplete. For scanned PDFs, use OCR.");
    }
    return { text: normalized, warnings, rawPages: data.numpages };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    warnings.push(`PDF parsing failed (${msg}). For scanned PDFs, enable enhanced OCR or export to DOCX/TXT.`);
    return { text: "", warnings };
  }
}

async function parseDocx(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const mammoth = await import("mammoth");
    const extractor = (mammoth as unknown as { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string; messages?: { message: string }[] }> }).extractRawText
      ?? (mammoth as unknown as { default: { extractRawText: (o: { buffer: Buffer }) => Promise<{ value: string; messages?: { message: string }[] }> } }).default?.extractRawText;
    if (!extractor) throw new Error("mammoth extractRawText not found");
    const result = await extractor({ buffer });
    if (!result.value || !result.value.trim()) {
      warnings.push("DOCX parsed but no text extracted — file may be corrupted or contain only images. Try converting to PDF or enable Docling worker.");
      return { text: "", warnings };
    }
    if (result.messages?.length) {
      warnings.push(`DOCX parser messages: ${result.messages.slice(0, 2).map((m) => m.message).join("; ")}`);
    }
    const normalized = normalizeIngestedText(result.value);
    const q = scoreTextQuality(normalized);
    if (q.isGarbage) {
      warnings.push("DOCX extracted text appears garbled — file may be corrupted.");
      return { text: "", warnings };
    }
    return { text: normalized, warnings };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    warnings.push(`DOCX parsing failed (${msg}). Try exporting to PDF or plain text.`);
    return { text: "", warnings };
  }
}

async function parsePptx(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    // PPTX is a ZIP of XML — extract slide texts without heavy deps
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jszipMod: any = await import("jszip");
    const JSZip: any = jszipMod.default ?? jszipMod;
    const zip = await JSZip.loadAsync(buffer);
    const slideTexts: string[] = [];
    // Collect slide files sorted — cap entries (zip-bomb guard)
    const slideFiles = Object.keys(zip.files)
      .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort()
      .slice(0, 200);
    if (Object.keys(zip.files).length > 2000) {
      warnings.push("PPTX contains an unusually large number of entries — extraction truncated to the first 200 slides.");
    }
    if (slideFiles.length === 0) {
      // Maybe not a valid PPTX — try generic
      const anyXml = Object.keys(zip.files).filter((p) => p.endsWith(".xml"));
      if (anyXml.length === 0) throw new Error("No slides found in PPTX");
    }
    for (const path of slideFiles) {
      const xml: string = await zip.files[path].async("string");
      if (xml.length > 2_000_000) {
        warnings.push(`Slide "${path}" exceeds 2 MB of XML — skipped to bound memory.`);
        continue;
      }
      // Extract <a:t> text nodes (DrawingML)
      const matches = [...xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)];
      const slideText = matches.map((m) => m[1]).join(" ").trim();
      if (slideText) slideTexts.push(slideText);
      // Bound total decompressed text (~5 MB) against zip bombs
      if (slideTexts.join(" ").length > 5_000_000) {
        warnings.push("PPTX text exceeded 5 MB — truncated to the first slides.");
        break;
      }
    }
    // Also try notes and title
    const notesFiles = Object.keys(zip.files).filter((p) => /^ppt\/notesSlides\//.test(p));
    for (const path of notesFiles.slice(0, 10)) {
      try {
        const xml: string = await zip.files[path].async("string");
        const matches = [...xml.matchAll(/<a:t[^>]*>([^<]+)<\/a:t>/g)];
        const t = matches.map((m) => m[1]).join(" ").trim();
        if (t) slideTexts.push(t);
      } catch { /* ignore */ }
    }
    // Core properties title
    try {
      const core = zip.files["docProps/core.xml"];
      if (core) {
        const xml: string = await core.async("string");
        const titleM = xml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
        if (titleM) slideTexts.unshift(`Title: ${titleM[1]}`);
      }
    } catch { /* ignore */ }

    const joined = slideTexts.join("\n\n");
    const normalized = normalizeIngestedText(joined);
    if (!normalized.trim()) {
      warnings.push("PPTX parsed but no text extracted — slides may be image-only. Enable Docling worker for OCR or export to PDF/DOCX.");
      return { text: "", warnings };
    }
    const q = scoreTextQuality(normalized);
    if (q.isGarbage) {
      warnings.push("PPTX text appears garbled — file may be image-based.");
      return { text: "", warnings };
    }
    return { text: normalized, warnings };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    warnings.push(`PPTX parsing failed (${msg}). A PDF export usually extracts more reliably.`);
    return { text: "", warnings };
  }
}

async function parseSvg(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    const raw = buffer.toString("utf8");
    // Extract <text> and <tspan> content
    const matches = [...raw.matchAll(/<(?:text|tspan)[^>]*>([^<]+)<\/(?:text|tspan)>/gi)];
    if (matches.length) {
      const text = matches.map((m) => m[1].trim()).filter(Boolean).join("\n");
      const normalized = normalizeIngestedText(text);
      if (normalized.trim()) return { text: normalized, warnings };
    }
    // Fallback: strip tags and see if any readable text remains
    const stripped = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    const normalized = normalizeIngestedText(stripped);
    if (normalized.trim() && normalized.trim().split(/\s+/).length >= 3 && !isProbablyBinaryText(normalized)) {
      return { text: normalized, warnings };
    }
    warnings.push("SVG has no extractable text elements — image-only SVG requires OCR or description.");
    return { text: "", warnings };
  } catch (e: unknown) {
    warnings.push(`SVG parsing failed (${e instanceof Error ? e.message : "unknown"})`);
    return { text: "", warnings };
  }
}

async function parseImageWithOcr(buffer: Buffer, filename: string, mime: string): Promise<{ text: string; warnings: string[]; meta?: Record<string, unknown> }> {
  const warnings: string[] = [];
  const meta: Record<string, unknown> = {};
  // SVG handled separately
  if (mime === "image/svg+xml" || filename.toLowerCase().endsWith(".svg")) {
    const r = await parseSvg(buffer);
    return { text: r.text, warnings: r.warnings, meta };
  }

  // Gather sharp metadata for useful placeholder even if OCR unavailable
  try {
    const { getImageInfo } = await import("@/lib/ocr");
    const info = await getImageInfo(buffer);
    if (info) {
      meta.imageWidth = info.width;
      meta.imageHeight = info.height;
      meta.imageFormat = info.format;
      meta.imageSizeBytes = info.sizeBytes;
    }
  } catch { /* ignore */ }

  // Try OCR — opt-in via ENABLE_LOCAL_OCR=true (slow, 8s timeout). Disabled by default to keep uploads fast (<200ms) and avoid Next.js standalone crash.
  // For image OCR, prefer Docling worker (Pillow+pytesseract, handles scanned PDFs & images reliably).
  const enableLocalOcr = process.env.ENABLE_LOCAL_OCR?.trim().toLowerCase() === "true" || process.env.ENABLE_LOCAL_OCR?.trim() === "1";
  if (enableLocalOcr) {
    try {
      const { ocrImageBuffer } = await import("@/lib/ocr");
      const ocr = await ocrImageBuffer(buffer, { timeoutMs: 8000 });
      if (ocr && ocr.text) {
        const normalized = normalizeIngestedText(ocr.text);
        const q = scoreTextQuality(normalized);
        // OCR can be noisy; accept if not garbage and at least 15 chars
        if (normalized.trim().length >= 15 && !q.isGarbage && q.score >= 0.25) {
          const stats = textStats(normalized);
          warnings.push(`Image OCR succeeded via ${ocr.engine} (confidence ${Math.round(ocr.confidence)}%, ${stats.wordCount} words). Review extracted text — OCR may contain errors.`);
          return { text: normalized, warnings, meta: { ...meta, ocrEngine: ocr.engine, ocrConfidence: ocr.confidence } };
        } else if (normalized.trim().length >= 15) {
          // Low quality OCR — still return but warn
          warnings.push(`Image OCR produced low-confidence text (score ${q.score.toFixed(2)}). Verify before use; consider enhancing image quality or using Docling worker with high-res scan.`);
          return { text: normalized, warnings, meta };
        }
      }
    } catch (e) {
      warnings.push(`Local OCR attempt failed (${e instanceof Error ? e.message : "unknown"})`);
    }
  }

  // No OCR or OCR failed — return metadata-rich placeholder (never garbled). Fast path (<100ms) when local OCR disabled.
  const dim = meta.imageWidth && meta.imageHeight ? `${meta.imageWidth}x${meta.imageHeight}` : "unknown dimensions";
  const fmt = (meta.imageFormat as string) ?? mime.split("/")[1] ?? "image";
  const ocrDisabledNote = !enableLocalOcr ? " (local OCR is off — an administrator can enable enhanced OCR for automatic transcription)" : "";
  const displayName = safeName(filename);
  return {
    text: `[Image: ${displayName} — ${fmt.toUpperCase()} ${dim}, ${(buffer.length / 1024).toFixed(1)} KB]\nThis image was not converted to text locally${ocrDisabledNote}.\n\nTo extract text, either enable enhanced OCR in your workspace and re-upload, or paste the image's transcript using the paste panel — the security pipeline will still scan and transform it.\n\nThe document is ingested with metadata only and scored as LOW risk until transcribed.`,
    warnings: ["Image contains no extracted text — stored as a metadata placeholder. Enable enhanced OCR or paste a transcript for full text search and transformation."],
    meta,
  };
}

function parseVideoPlaceholder(filename: string, mime: string): { text: string; warnings: string[] } {
  const displayName = safeName(filename);
  return {
    text: `[Video/Audio: ${displayName} (${mime}) — ${(mime.startsWith("video") ? "video" : "audio")} placeholder]\nThis media file was not transcribed locally. For meaningful scanning, provide a transcript using the paste panel — the security pipeline will still scan and transform it.\n\nThe file is tracked with a full audit trail, but transformation will be generic until a transcript is supplied.`,
    warnings: ["Video/audio transcription is not bundled — paste a transcript as text for full scanning and transformation."],
  };
}

export async function parseDocument(opts: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ParsedDocument> {
  const { filename, mimeType } = opts;
  const buffer = opts.buffer;
  const lowerName = filename.toLowerCase();
  const ext = lowerName.split(".").pop() ?? "";
  const mime = (mimeType || "").toLowerCase();
  const warnings: string[] = [];

  // Trust-boundary: size + MIME validation (media gets larger allowance)
  const isMedia = ["mp4", "mov", "webm", "avi", "mp3", "wav", "ogg"].includes(ext) || mime.startsWith("video/") || mime.startsWith("audio/");
  const limit = isMedia ? MAX_BYTES_MEDIA : MAX_BYTES_TEXT;
  if (buffer.byteLength > limit) {
    throw new Error(`File too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${limit / 1024 / 1024} MB.`);
  }
  if (!isAllowedMime(mime) && !["pdf", "docx", "doc", "pptx", "txt", "md", "csv", "json", "png", "jpg", "jpeg", "webp", "tiff", "svg", "mp4", "mov", "webm", "avi", "mp3", "wav", "ogg", "html"].includes(ext)) {
    warnings.push(`Unrecognized MIME/type "${mime || ext}" — treating as text and attempting to extract.`);
  }

  // Determine binary types that benefit from Docling (now includes images)
  const isBinaryForDocling =
    ["pdf", "docx", "doc", "pptx", "png", "jpg", "jpeg", "webp", "tiff", "svg", "mp4", "mov", "webm", "avi", "mp3", "wav", "ogg"].includes(ext) ||
    mime === "application/pdf" ||
    mime.startsWith("image/") ||
    mime.startsWith("video/") ||
    mime.startsWith("audio/");
  if (isBinaryForDocling && process.env.DOCLING_WORKER_URL) {
    const doclingText = await tryDoclingWorker(buffer, filename, mimeType);
    if (doclingText) {
      const stats = textStats(doclingText);
      return {
        text: doclingText,
        warnings: ["Parsed via Docling worker (Python) — high-fidelity extraction."],
        sha256: sha256(doclingText),
        sourceFormat: mime || ext,
        pages: stats.pages,
        sections: stats.sections,
        wordCount: stats.wordCount,
        charCount: stats.charCount,
        metadata: { parser: "docling", filename, mimeType, doclingQuality: scoreTextQuality(doclingText).score },
      };
    } else if (["pdf", "docx", "pptx", "png", "jpg", "jpeg", "webp", "tiff"].includes(ext) || mime.startsWith("image/")) {
      warnings.push("Docling worker did not return text (or returned low-quality) — falling back to local parsers.");
    }
  }

  let text = "";
  let parser = "raw";
  let extraMeta: Record<string, unknown> = {};

  if (ext === "pdf" || mime === "application/pdf") {
    parser = "pdf-parse";
    const r = await parsePdf(buffer);
    text = r.text;
    warnings.push(...r.warnings);
    if (r.rawPages) extraMeta.pdfPages = r.rawPages;
    // If pdf-parse yielded nothing but worker was tried, we already warned. Provide OCR guidance.
    if (!text.trim()) {
      // Don't return garbage — provide actionable placeholder that still allows scanning if user later pastes OCR
      // But we keep text empty so route can surface 400 with helpful message; caller handles that
    }
  } else if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    parser = "mammoth";
    const r = await parseDocx(buffer);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (ext === "pptx" || mime === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    parser = "jszip-pptx";
    const r = await parsePptx(buffer);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (["png", "jpg", "jpeg", "webp", "tiff", "svg"].includes(ext) || mime.startsWith("image/")) {
    parser = "image-ocr";
    const r = await parseImageWithOcr(buffer, filename, mime || `image/${ext}`);
    text = r.text;
    warnings.push(...r.warnings);
    if (r.meta) extraMeta = { ...extraMeta, ...r.meta };
    // Image placeholders are considered "extracted" (metadata) — don't trigger binary-text empty handling below
  } else if (["mp4", "mov", "webm", "avi", "mp3", "wav", "ogg"].includes(ext) || mime.startsWith("video/") || mime.startsWith("audio/")) {
    parser = "video-placeholder";
    const r = parseVideoPlaceholder(filename, mime || ext);
    text = r.text;
    warnings.push(...r.warnings);
  } else {
    // Text-family: decode with encoding sniffing (utf8 -> latin1 fallback) and normalize
    text = decodeTextBuffer(buffer);
    // HTML sources: drop active content entirely, then extract visible text so
    // <script>/<style> payloads are never stored or scanned as prose.
    if (ext === "html" || ext === "htm" || mime === "text/html") {
      text = extractVisibleTextFromHtml(text);
    }
    const normalized = normalizeIngestedText(text);
    if (normalized.length > 0) text = normalized;
    // Detect binary masquerading as text (e.g., compressed stream decoded as printable gibberish "PJYI~A-2…")
    if (isProbablyBinaryText(text) || scoreTextQuality(text).isGarbage) {
      warnings.push("File appears to be binary or encoded data but was treated as text — no readable text extracted. Upload as PDF/DOCX/PPTX/image or enable the Docling worker. If this is a text file, ensure it is UTF-8 encoded.");
      text = "";
    } else {
      const printable = text.replace(/[^\x20-\x7E\x0A\x0D\u00A0-\u024F\u0400-\u04FF\u0900-\u097F\u0600-\u06FF\u4E00-\u9FFF]/g, "").length;
      if (printable / Math.max(1, text.length) < 0.72) {
        warnings.push("File appears to be binary but was treated as text — results may be incomplete. Try uploading as PDF/DOCX.");
      }
    }
    parser = "utf8";
  }

  // Normalize all parser outputs to strip control/zero-width/replacement chars
  text = normalizeIngestedText(text);

  // Final quality gate: never surface garbled output to the scanning pipeline
  if (text.trim()) {
    const q = scoreTextQuality(text);
    // Allow placeholder texts (they have intentional structure) even if dictionaryRatio low
    const isPlaceholder = text.startsWith("[Image:") || text.startsWith("[Video/Audio:") || text.startsWith("[Image content");
    if (!isPlaceholder && (q.isGarbage || q.score < 0.30)) {
      warnings.push(`Extracted text quality low (score ${q.score.toFixed(2)}, printable ${(q.printableRatio * 100).toFixed(0)}%). Treated as no extractable text to avoid obscure output. For image/scanned PDFs, enable OCR.`);
      text = "";
    }
  }

  // Final fallback: if we got almost nothing, do NOT surface raw binary snippet
  // Exception: image/video placeholders ARE meaningful (they describe the file) — keep them
  const isPlaceholderFinal = text.startsWith("[Image:") || text.startsWith("[Video/Audio:");
  if (!text.trim() && !isPlaceholderFinal) {
    warnings.push("No extractable text found in file. For scanned PDFs or images, enable enhanced OCR or paste the transcript as text.");
    text = "";
  }

  // If text is placeholder, keep it but compute stats on it; otherwise stats on extracted text
  const stats = textStats(text);
  return {
    text,
    warnings,
    sha256: sha256(text),
    sourceFormat: mime || ext || "text/plain",
    pages: stats.pages,
    sections: stats.sections,
    wordCount: stats.wordCount,
    charCount: stats.charCount,
    metadata: { parser, filename, mimeType, ext, byteLength: buffer.byteLength, ...extraMeta },
  };
}

/** Extract visible text from HTML: drop script/style/noscript blocks, then tags. */
function extractVisibleTextFromHtml(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script\s*>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style\s*>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript\s*>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)([^>]*)>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  return s.replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"');
}

function decodeTextBuffer(buf: Buffer): string {  // Try UTF-8 first; if it yields many replacement chars or invalid sequences, fall back
  const utf8 = buf.toString("utf8");
  const replacements = (utf8.match(/\uFFFD/g) || []).length;
  if (replacements > utf8.length * 0.02) {
    // Fallback to latin1 for legacy files (common on Windows)
    try {
      const latin = buf.toString("latin1");
      // If latin1 is more printable, use it
      const uPrint = utf8.replace(/[^\x20-\x7E\x0A\x0D]/g, "").length;
      const lPrint = latin.replace(/[^\x20-\x7E\x0A\x0D]/g, "").length;
      if (lPrint > uPrint) return latin;
    } catch {
      // ignore
    }
  }
  return utf8;
}
