// Optional local OCR via tesseract.js + sharp; null when unavailable.

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
  // Disabled by default; enable with ENABLE_LOCAL_OCR=true. Docling worker preferred in production.
  return v === "true" || v === "1" || v === "yes";
}

async function isTesseractAvailable(): Promise<boolean> {
  if (!isLocalOcrEnabled()) return false;
  if (tesseractAvailable !== null) return tesseractAvailable;
  if (tesseractLoadAttempted) return false;
  tesseractLoadAttempted = true;
  try {
    // Dynamic import with eval so bundlers skip the worker script.
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

    const img = sharp(buffer);
    const meta = await img.metadata().catch(() => null);
    let pipeline = img.grayscale().normalize();
    // Upscale tiny images 2x.
    if (meta && meta.width && meta.height && meta.width < 800) {
      const scale = Math.min(2, Math.ceil(800 / meta.width));
      pipeline = pipeline.resize({ width: meta.width * scale, withoutEnlargement: false, kernel: "cubic" as any });
    }

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
  // Skip SVG (handled via XML extraction).
  if (buffer.toString("utf8", 0, 200).includes("<svg")) return null;

  let preprocessed = buffer;
  try {
    preprocessed = await preprocessWithSharp(buffer);
  } catch {

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
    // Swallow late worker failures after a timeout win.
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
