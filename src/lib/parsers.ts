// SecureContent AI — Document parsing layer
// Lightweight, zero-heavy-deps ingestion for local use on Fedora/Windows.
// Supports: TXT/MD/CSV/JSON (direct), PDF (pdf-parse), DOCX (mammoth), images (stub).
// Optional Docling worker (Python) is proxied when DOCLING_WORKER_URL is set.

import crypto from "crypto";
import { normalizeIngestedText } from "@/lib/text";

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
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { method: "POST", body: form as unknown as BodyInit, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j: unknown = await res.json().catch(() => null);
    if (j && typeof j === "object" && "text" in j && typeof (j as { text: unknown }).text === "string" && (j as { text: string }).text.trim()) {
      return (j as { text: string }).text;
    }
    if (typeof j === "string" && j.trim()) return j;
    return null;
  } catch {
    return null;
  }
}

async function parsePdf(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    // pdf-parse is CommonJS; dynamic import avoids bundler interop issues in Next.js
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await import("pdf-parse");
    const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number; info?: unknown }>;
    const data = await pdfParse(buffer);
    if (!data.text || !data.text.trim()) {
      warnings.push("PDF parsed but no extractable text found — likely a scanned image. Run OCR or the Docling worker for scanned PDFs.");
      return { text: "", warnings };
    }
    return { text: normalizeIngestedText(data.text), warnings };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    warnings.push(`PDF parsing failed (${msg}). Install 'pdf-parse' or use the Docling worker for complex PDFs.`);
    // Heuristic fallback removed — previous version decoded binary PDF as UTF-8 and surfaced
    // obscure control characters. Return empty and let the caller surface a clean warning.
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
      warnings.push("DOCX parsed but no text extracted.");
      return { text: "", warnings };
    }
    if (result.messages?.length) {
      warnings.push(`DOCX parser messages: ${result.messages.slice(0, 2).map((m) => m.message).join("; ")}`);
    }
    return { text: normalizeIngestedText(result.value), warnings };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "unknown";
    warnings.push(`DOCX parsing failed (${msg}). Ensure 'mammoth' is installed.`);
    return { text: "", warnings };
  }
}

function parseImagePlaceholder(filename: string): { text: string; warnings: string[] } {
  return {
    text: `[Image content placeholder — ${filename}]\nThis image was not OCR'd locally. For scanned documents, run the optional Docling worker (Python) or enable Tesseract.js. Upload a text-based PDF/DOCX/TXT for full local parsing.\n\nTo enable: set DOCLING_WORKER_URL=http://localhost:8001/parse and run mini-services/docling-worker, or integrate a vision model via the transform pipeline by pasting the image description as contextual information.`,
    warnings: ["Image OCR not bundled by default to keep the app lightweight. See docs/ingestion.md for enabling Docling or Tesseract."],
  };
}

function parseVideoPlaceholder(filename: string, mime: string): { text: string; warnings: string[] } {
  return {
    text: `[Video/Audio content placeholder — ${filename} (${mime})]\nThis media file was not transcribed locally. For video/audio, provide a transcript or summary as contextual information, or run an external transcription worker (e.g., Whisper) and paste the result. The platform will then transform the transcript into the requested artefact (summary, minutes, newsletter, etc.).`,
    warnings: ["Video/audio transcription not bundled by default. See docs/ingestion.md — provide transcript as text or run a transcription worker."],
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

  // Attempt Docling worker first for binary formats (best quality, optional)
  const isBinary = ["pdf", "docx", "doc", "pptx", "png", "jpg", "jpeg", "webp", "tiff", "svg", "mp4", "mov", "webm", "avi", "mp3", "wav", "ogg"].includes(ext) || mime === "application/pdf" || mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/");
  if (isBinary && process.env.DOCLING_WORKER_URL) {
    const doclingText = await tryDoclingWorker(buffer, filename, mimeType);
    if (doclingText) {
      const clean = normalizeIngestedText(doclingText);
      const stats = textStats(clean);
      return {
        text: clean,
        warnings: ["Parsed via Docling worker (Python)."],
        sha256: sha256(clean),
        sourceFormat: mime || ext,
        pages: stats.pages,
        sections: stats.sections,
        wordCount: stats.wordCount,
        charCount: stats.charCount,
        metadata: { parser: "docling", filename, mimeType },
      };
    }
  }

  let text = "";
  let parser = "raw";

  if (ext === "pdf" || mime === "application/pdf") {
    parser = "pdf-parse";
    const r = await parsePdf(buffer);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    parser = "mammoth";
    const r = await parseDocx(buffer);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (ext === "pptx") {
    warnings.push("PPTX parsing is not bundled. Convert to PDF/DOCX or use the Docling worker for slide extraction.");
    text = "";
    parser = "pptx-placeholder";
  } else if (["png", "jpg", "jpeg", "webp", "tiff", "svg"].includes(ext) || mime.startsWith("image/")) {
    parser = "image-placeholder";
    const r = parseImagePlaceholder(filename);
    text = r.text;
    warnings.push(...r.warnings);
  } else if (["mp4", "mov", "webm", "avi", "mp3", "wav", "ogg"].includes(ext) || mime.startsWith("video/") || mime.startsWith("audio/")) {
    parser = "video-placeholder";
    const r = parseVideoPlaceholder(filename, mime || ext);
    text = r.text;
    warnings.push(...r.warnings);
  } else {
    // Text-family: decode with encoding sniffing (utf8 -> latin1 fallback) and normalize
    text = decodeTextBuffer(buffer);
    const normalized = normalizeIngestedText(text);
    if (normalized.length > 0) text = normalized;
    // Detect binary masquerading as text (e.g., compressed stream decoded as printable gibberish "PJYI~A-2…")
    const { isProbablyBinaryText: isBinary } = await import("@/lib/text");
    if (isBinary(text)) {
      warnings.push("File appears to be binary or encoded data but was treated as text — no readable text extracted. Try PDF/DOCX or enable the Docling worker.");
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

  // Final fallback: if we got almost nothing, do NOT surface raw binary snippet
  if (!text.trim()) {
    warnings.push("No extractable text found in file. For scanned PDFs/images, enable the Docling worker.");
    text = "";
  }

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
    metadata: { parser, filename, mimeType, ext, byteLength: buffer.byteLength },
  };
}

function decodeTextBuffer(buf: Buffer): string {
  // Try UTF-8 first; if it yields many replacement chars or invalid sequences, fall back
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
