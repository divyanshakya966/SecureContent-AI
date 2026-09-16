// SecureContent AI — Local OCR helper (lightweight)
// Tries tesseract.js when available; falls back to null so caller can use placeholder.
// Uses sharp for preprocessing (grayscale, normalize) to improve OCR quality.

import type { Buffer } from "buffer";

export interface OcrResult {
  text: string;
  confidence: number; // 0..100
  engine: string;
}

let tesseractLoadAttempted = false;
let tesseractAvailable: boolean | null = null;

function isLocalOcrEnabled(): boolean {
  const v = process.env.ENABLE_LOCAL_OCR?.trim().toLowerCase();
  // Disabled by default — local tesseract is slow (10-20s) and can crash in Next.js standalone
  // Enable explicitly: ENABLE_LOCAL_OCR=true  (requires `bun add tesseract.js` and `serverExternalPackages`)
  // For production image OCR, prefer Docling worker (Pillow+pytesseract) which is faster and more accurate.
  return v === "true" || v === "1" || v === "yes";
}

async function isTesseractAvailable(): Promise<boolean> {
  if (!isLocalOcrEnabled()) return false;
  if (tesseractAvailable !== null) return tesseractAvailable;
  if (tesseractLoadAttempted) return false;
  tesseractLoadAttempted = true;
  try {
    // Dynamic import so app works even without tesseract.js installed
    // Use eval to avoid Next.js bundling `tesseract.js/src/worker-script/...` as /ROOT/...
    const importUrl = "tesseract.js";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mod: any = await (0, eval)(`import(${JSON.stringify(importUrl)})`);
    tesseractAvailable = !!(mod.default ?? mod);
    return tesseractAvailable;
  } catch {
    tesseractAvailable = false;
    return false;
  }
}

async function preprocessWithSharp(buffer: Buffer): Promise<Buffer> {
  try {
    const sharp = (await import("sharp")).default;
    // Normalize for OCR: grayscale, increase contrast, resize if too small
    const img = sharp(buffer);
    const meta = await img.metadata().catch(() => null);
    let pipeline = img.grayscale().normalize();
    // If image is tiny, upscale 2x for OCR readability
    if (meta && meta.width && meta.height && meta.width < 800) {
      const scale = Math.min(2, Math.ceil(800 / meta.width));
      pipeline = pipeline.resize({ width: meta.width * scale, withoutEnlargement: false, kernel: "cubic" as any });
    }
    // Ensure PNG output for tesseract
    const out = await pipeline.png().toBuffer();
    return out;
  } catch {
    return buffer;
  }
}

export async function ocrImageBuffer(buffer: Buffer, opts?: { lang?: string; timeoutMs?: number }): Promise<OcrResult | null> {
  if (!isLocalOcrEnabled()) return null;
  const lang = opts?.lang ?? "eng";
  const timeoutMs = opts?.timeoutMs ?? 8000;
  if (!(await isTesseractAvailable())) return null;
  if (!buffer || buffer.length < 100) return null;
  // SVG is vector — rasterizing via sharp may be needed; tesseract on raw SVG is poor
  // We handle SVG separately via xml extraction elsewhere, so skip OCR for SVG here
  if (buffer.toString("utf8", 0, 200).includes("<svg")) return null;

  let preprocessed = buffer;
  try {
    preprocessed = await preprocessWithSharp(buffer);
  } catch {
    // keep original
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tesseractMod: any = await (0, eval)(`import("tesseract.js")`);
    const Tesseract: any = tesseractMod.default ?? tesseractMod;
    const recognize = Tesseract.recognize ?? Tesseract.default?.recognize;
    if (!recognize) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let timeoutHandle: any;
    const timeoutPromise = new Promise<null>((resolve) => {
      timeoutHandle = setTimeout(() => resolve(null), timeoutMs);
    });

    const ocrPromise = (async () => {
      try {
        const result = await recognize(preprocessed, lang, {
          // logger: () => {},
        });
        const text = (result?.data?.text as string) ?? "";
        const conf = (result?.data?.confidence as number) ?? 0;
        if (!text.trim()) return null;
        return { text: text.trim(), confidence: conf, engine: "tesseract.js" } as OcrResult;
      } catch {
        return null;
      }
    })();
    // Avoid an unhandled rejection if the timeout wins and the worker later fails.
    ocrPromise.catch(() => null);

    const res = await Promise.race([ocrPromise, timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);
    return res as OcrResult | null;
  } catch {
    return null;
  }
}

export async function getImageInfo(buffer: Buffer): Promise<{ width?: number; height?: number; format?: string; sizeBytes: number } | null> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    return { width: meta.width, height: meta.height, format: meta.format, sizeBytes: buffer.length };
  } catch {
    return { sizeBytes: buffer.length };
  }
}
