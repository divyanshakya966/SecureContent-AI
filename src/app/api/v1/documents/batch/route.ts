import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit, getPolicyByName } from "@/lib/api/helpers";
import { ingestDocument, sanitizeFilename } from "@/lib/ingest";
import { parseDocument } from "@/lib/parsers";
import { runFullPipeline } from "@/lib/pipeline-run";
import { checkRateLimit, rateLimitKey, rateLimitHeaders, checkGlobalRateLimit } from "@/lib/validation/rateLimit";
import { requireApiAuth, safeLogDetail } from "@/lib/auth";
import { ToneEnum, LanguageEnum, DetailLevelEnum, ObjectiveEnum, StyleEnum } from "@/lib/validation/schemas";
import { OUTPUT_TYPES, type BulkIngestResultItem, type Classification, type OutputType } from "@/types";

export const runtime = "nodejs";


const MAX_FILES = 20;
const MAX_BYTES_TEXT = 10 * 1024 * 1024;
const MAX_BYTES_MEDIA = 25 * 1024 * 1024;
const MAX_BYTES_TOTAL = 100 * 1024 * 1024;
const MEDIA_EXT = new Set(["mp4", "mov", "webm", "avi", "mp3", "wav", "ogg"]);

function fileLimit(name: string, mime: string): number {
  const ext = (name.split(".").pop() ?? "").toLowerCase();
  if (MEDIA_EXT.has(ext) || mime.startsWith("video/") || mime.startsWith("audio/")) return MAX_BYTES_MEDIA;
  return MAX_BYTES_TEXT;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

// Bulk ingest: up to 20 files per request, each with its own outcome.
export async function POST(req: NextRequest) {
  const auth = requireApiAuth(req);
  if (auth) return auth;
  const rl = checkRateLimit(rateLimitKey(req, "POST /api/v1/documents/batch"), { max: 5, windowMs: 60_000 });
  // Spoof-proof global backstop for this expensive route (header IPs are forgeable direct-to-app).
  const global = checkGlobalRateLimit("POST /api/v1/documents/batch", { max: 60, windowMs: 60_000 });
  if (!global.allowed) {
    return NextResponse.json(
      { error: "Rate limited — bulk ingest is expensive, try again shortly." },
      { status: 429, headers: rateLimitHeaders(global, 60) }
    );
  }
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited — bulk ingest is expensive, try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 5) }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Send multipart/form-data with files[] entries." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Could not read multipart body." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  const files = form.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files provided — attach one or more files[] entries." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Too many files (${files.length}). Maximum is ${MAX_FILES} per batch.` }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }


  let totalBytes = 0;
  for (const file of files) {
    const name = file.name || "upload";
    const limit = fileLimit(name, file.type || "");
    if (file.size > limit) {
      return NextResponse.json({ error: `"${name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${limit / 1024 / 1024} MB.` }, { status: 400, headers: rateLimitHeaders(rl, 5) });
    }
    totalBytes += file.size;
  }
  if (totalBytes > MAX_BYTES_TOTAL) {
    return NextResponse.json({ error: `Batch too large (${(totalBytes / 1024 / 1024).toFixed(1)} MB). Maximum is ${MAX_BYTES_TOTAL / 1024 / 1024} MB per batch.` }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }

  const str = (key: string): string | undefined => {
    const v = form.get(key);
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const policyName = str("policy") ?? "PUBLIC_RELEASE";
  const runPipeline = (str("runPipeline") ?? "false").toLowerCase() === "true";
  const skipDuplicates = (str("skipDuplicates") ?? "true").toLowerCase() === "true";
  const stopOnError = (str("stopOnError") ?? "false").toLowerCase() === "true";
  const concurrency = Math.max(1, Math.min(5, parseInt(str("concurrency") ?? "3", 10) || 3));
  const batchId = str("batchId") ?? crypto.randomUUID();

  const policy = await getPolicyByName(policyName);
  if (!policy) {
    return NextResponse.json({ error: "Unknown policy." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }

  let outputTypes: OutputType[] = [];
  const rawTypes = str("outputTypes");
  if (rawTypes) {
    try {
      const parsed: unknown = JSON.parse(rawTypes);
      if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 8 || !parsed.every((t) => typeof t === "string" && (OUTPUT_TYPES as string[]).includes(t))) {
        throw new Error("bad");
      }
      outputTypes = parsed as OutputType[];
    } catch {
      return NextResponse.json({ error: "outputTypes must be a JSON array of 1–8 known output types." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
    }
  }
  if (runPipeline && outputTypes.length === 0) {
    return NextResponse.json({ error: "runPipeline needs outputTypes — pick at least one deliverable." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  // Strictly validate generation controls (previously passed through unvalidated).
  const genParams: { tone?: string; language?: string; detailLevel?: string; objective?: string; style?: string } = {};
  const rawGen = {
    tone: str("tone"), language: str("language"), detailLevel: str("detailLevel"),
    objective: str("objective"), style: str("style"),
  };
  if (rawGen.tone !== undefined && !ToneEnum.safeParse(rawGen.tone).success) {
    return NextResponse.json({ error: "tone: invalid value." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  if (rawGen.language !== undefined && !LanguageEnum.safeParse(rawGen.language).success) {
    return NextResponse.json({ error: "language: invalid value." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  if (rawGen.detailLevel !== undefined && !DetailLevelEnum.safeParse(rawGen.detailLevel).success) {
    return NextResponse.json({ error: "detailLevel: invalid value." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  if (rawGen.objective !== undefined && !ObjectiveEnum.safeParse(rawGen.objective).success) {
    return NextResponse.json({ error: "objective: invalid value." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  if (rawGen.style !== undefined && !StyleEnum.safeParse(rawGen.style).success) {
    return NextResponse.json({ error: "style: invalid value." }, { status: 400, headers: rateLimitHeaders(rl, 5) });
  }
  Object.assign(genParams, Object.fromEntries(Object.entries(rawGen).filter(([, v]) => v !== undefined)));

  const results: BulkIngestResultItem[] = new Array(files.length);
  let stopped = false;

  await mapWithConcurrency(files, concurrency, async (file, i) => {
    const filename = sanitizeFilename(file.name || `upload-${i + 1}`);
    if (stopped) {
      results[i] = { filename, status: "cancelled", error: "Cancelled after an earlier failure (stopOnError)." };
      return;
    }
    const fail = (error: string): void => {
      results[i] = { filename, status: "failed", error };
      if (stopOnError) stopped = true;
    };
    try {
      const mimeType = file.type || "application/octet-stream";
      const buf = Buffer.from(await file.arrayBuffer());
      let parsed: Awaited<ReturnType<typeof parseDocument>>;
      try {
        parsed = await parseDocument({ filename, mimeType, buffer: buf });
      } catch (e: unknown) {
        fail(e instanceof Error ? e.message : "File parsing failed.");
        return;
      }
      if (!parsed.text.trim()) {
        const hint = parsed.warnings.length ? ` — ${parsed.warnings[0]}` : "";
        fail(`No extractable text found in "${filename}"${hint}.`);
        return;
      }
      if (skipDuplicates) {
        const existing = await db.document.findFirst({
          where: { metadata: { contains: parsed.sha256 } },
          select: { id: true, title: true },
        });
        if (existing) {
          results[i] = { filename, status: "skipped", documentId: existing.id, title: existing.title, error: "Duplicate content — already ingested." };
          return;
        }
      }
      let created: Awaited<ReturnType<typeof ingestDocument>>;
      try {
        created = await ingestDocument({
          filename,
          mimeType,
          content: parsed.text,
          sourceKind: "UPLOAD",
          parsedMeta: {
            ...parsed.metadata,
            sha256: parsed.sha256,
            pages: parsed.pages,
            sections: parsed.sections,
            charCount: parsed.charCount,
            wordCount: parsed.wordCount,
            warnings: parsed.warnings,
          },
          warnings: parsed.warnings,
        });
      } catch (e: unknown) {
        fail(e instanceof Error ? e.message : "Ingest failed.");
        return;
      }
      const createdId = (created as { id: string }).id;
      const createdTitle = (created as { title: string }).title;
      const createdRisk = (created as { riskScore: number }).riskScore;
      const createdClass = (created as { classification: Classification }).classification;

      if (!runPipeline) {
        results[i] = { filename, status: "ingested", documentId: createdId, title: createdTitle, risk: createdRisk, classification: createdClass };
        return;
      }

      try {
        const pipe = await runFullPipeline({
          documentId: createdId,
          policyName: policy.name,
          outputTypes,
          params: genParams as never,
          batchId,
        });
        if (pipe.blocked) {
          results[i] = { filename, status: "blocked", documentId: createdId, title: createdTitle, risk: createdRisk, classification: createdClass, error: pipe.blockReason ?? "Blocked by policy." };
          return;
        }
        results[i] = {
          filename, status: "pipelined", documentId: createdId, title: createdTitle,
          risk: createdRisk, classification: createdClass,
          transformations: pipe.transformations.length,
          transformationErrors: pipe.errors.length ? pipe.errors : undefined,
        };
      } catch (e: unknown) {
        results[i] = {
          filename, status: "pipeline-failed", documentId: createdId, title: createdTitle,
          risk: createdRisk, classification: createdClass,
          error: e instanceof Error ? e.message : "Pipeline failed.",
        };
        if (stopOnError) stopped = true;
      }
    } catch (e: unknown) {
      fail(e instanceof Error ? e.message : "Ingest failed.");
    }
  });

  const summary = {
    total: results.length,
    ingested: results.filter((r) => r.status === "ingested").length,
    pipelined: results.filter((r) => r.status === "pipelined").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    failed: results.filter((r) => r.status === "failed" || r.status === "pipeline-failed").length,
    cancelled: results.filter((r) => r.status === "cancelled").length,
  };
  await logAudit({
    actor: "analyst",
    action: "BULK_INGEST",
    detail: `Bulk ingest ${batchId}: ${summary.total} files → ${summary.pipelined} pipelined, ${summary.ingested} ingested, ${summary.skipped} skipped, ${summary.blocked} blocked, ${summary.failed} failed, ${summary.cancelled} cancelled. Policy "${policy.name}"${runPipeline ? `, outputs ${outputTypes.join(",")}` : ""}.`,
  });

  return NextResponse.json(
    { batchId, policy: policy.name, runPipeline, results, summary },
    { headers: rateLimitHeaders(rl, 5) }
  );
}
