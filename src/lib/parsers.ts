// SecureContent AI — Document parsing layer
// Lightweight, zero-heavy-deps ingestion for local use on Fedora/Windows.
// Supports: TXT/MD/CSV/JSON (direct), PDF (pdf-parse), DOCX (mammoth), images (stub).
// Optional Docling worker (Python) is proxied when DOCLING_WORKER_URL is set.

import crypto from "crypto";

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

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_PREFIXES = ["text/", "application/json", "application/csv"];

const ALLOWED_MIME_EXACT = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/tiff",
]);

function isAllowedMime(mime: string): boolean {
  if (!mime) return true; // fallback for missing mime
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
  try {
    const form = new FormData();
    // @ts-ignore — Node >=18 has global Blob/FormData
    const blob = new Blob([new Uint8Array(buffer)], { type: mime });
    form.append("file", blob, filename);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url, { method: "POST", body: form as any, signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const j = await res.json().catch(() => null) as any;
    if (j && typeof j.text === "string" && j.text.trim()) return j.text as string;
    if (typeof j === "string" && j.trim()) return j as string;
    return null;
  } catch {
    return null;
  }
}

async function parsePdf(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    // pdf-parse is CommonJS; dynamic require avoids ESM interop issues in Next.js
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse: (b: Buffer) => Promise<{ text: string; numpages: number; info?: unknown }> = require("pdf-parse");
    const data = await pdfParse(buffer);
    if (!data.text || !data.text.trim()) {
      warnings.push("PDF parsed but no extractable text found — likely a scanned image. Run OCR or the Docling worker for scanned PDFs.");
      return { text: "", warnings };
    }
    return { text: data.text, warnings };
  } catch (e: any) {
    warnings.push(`PDF parsing failed (${e?.message ?? "unknown"}). Install 'pdf-parse' or use the Docling worker for complex PDFs.`);
    // Heuristic: try to pull literal strings from the buffer (BT/ET blocks)
    const raw = buffer.toString("utf8");
    const candidates = [...raw.matchAll(/\(([^)]{3,})\)/g)].map((m) => m[1]).join(" ");
    if (candidates.trim().length > 40) {
      warnings.push("Heuristic PDF text fallback applied — results may be incomplete.");
      return { text: candidates.slice(0, 20000), warnings };
    }
    return { text: "", warnings };
  }
}

async function parseDocx(buffer: Buffer): Promise<{ text: string; warnings: string[] }> {
  const warnings: string[] = [];
  try {
    // mammoth is CommonJS
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mammoth = require("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    if (!result.value || !result.value.trim()) {
      warnings.push("DOCX parsed but no text extracted.");
      return { text: "", warnings };
    }
    if (result.messages?.length) {
      warnings.push(`DOCX parser messages: ${result.messages.slice(0, 2).map((m: any) => m.message).join("; ")}`);
    }
    return { text: result.value, warnings };
  } catch (e: any) {
    warnings.push(`DOCX parsing failed (${e?.message ?? "unknown"}). Ensure 'mammoth' is installed.`);
    return { text: "", warnings };
  }
}

function parseImagePlaceholder(filename: string): { text: string; warnings: string[] } {
  return {
    text: `[Image content placeholder — ${filename}]\nThis image was not OCR'd locally. For scanned documents, run the optional Docling worker (Python) or enable Tesseract.js. Upload a text-based PDF/DOCX/TXT for full local parsing.`,
    warnings: ["Image OCR not bundled by default to keep the app lightweight. See docs/ingestion.md for enabling Docling or Tesseract."],
  };
}

export async function parseDocument(opts: {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<ParsedDocument> {
  const { filename, mimeType } = opts;
  let buffer = opts.buffer;
  const lowerName = filename.toLowerCase();
  const ext = lowerName.split(".").pop() ?? "";
  const mime = (mimeType || "").toLowerCase();
  const warnings: string[] = [];

  // Trust-boundary: size + MIME validation
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`File too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_BYTES / 1024 / 1024} MB.`);
  }
  if (!isAllowedMime(mime) && !["pdf", "docx", "doc", "pptx", "txt", "md", "csv", "json", "png", "jpg", "jpeg", "webp", "tiff"].includes(ext)) {
    warnings.push(`Unrecognized MIME/type "${mime || ext}" — treating as text and attempting to extract.`);
  }

  // Attempt Docling worker first for binary formats (best quality, optional)
  const isBinary = ["pdf", "docx", "doc", "pptx", "png", "jpg", "jpeg", "webp", "tiff"].includes(ext) || mime === "application/pdf";
  if (isBinary && process.env.DOCLING_WORKER_URL) {
    const doclingText = await tryDoclingWorker(buffer, filename, mimeType);
    if (doclingText) {
      const stats = textStats(doclingText);
      return {
        text: doclingText,
        warnings: ["Parsed via Docling worker (Python)."],
        sha256: sha256(doclingText),
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
    text = buffer.toString("utf8").slice(0, 20000);
    parser = "pptx-placeholder";
  } else if (["png", "jpg", "jpeg", "webp", "tiff"].includes(ext) || mime.startsWith("image/")) {
    parser = "image-placeholder";
    const r = parseImagePlaceholder(filename);
    text = r.text;
    warnings.push(...r.warnings);
  } else {
    // Text-family: detect encoding heuristically; Node Buffers are UTF-8 by default
    text = buffer.toString("utf8");
    // If the decoded text is mostly control chars, it was likely binary mislabeled as text
    const printable = text.replace(/[^\x20-\x7E\x0A\x0D]/g, "").length;
    if (printable / Math.max(1, text.length) < 0.6) {
      warnings.push("File appears to be binary but was treated as text — results may be incomplete. Try uploading as PDF/DOCX.");
    }
    parser = "utf8";
  }

  // Final fallback: if we got almost nothing, surface the raw snippet
  if (!text.trim()) {
    const snippet = buffer.toString("utf8").slice(0, 2000).replace(/\0/g, "").trim();
    if (snippet) {
      warnings.push("No structured parser output; falling back to raw text snippet.");
      text = snippet;
    } else {
      warnings.push("No extractable text found in file.");
    }
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
