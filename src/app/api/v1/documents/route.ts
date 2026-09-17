import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit } from "@/lib/api/helpers";
import { ingestDocument as createDocument, sanitizeFilename } from "@/lib/ingest";
import { SAMPLE_DOCUMENTS } from "@/lib/security/samples";
import { parseDocument } from "@/lib/parsers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { requireApiAuth } from "@/lib/auth";
import { DocumentUploadJsonSchema, PaginationSchema, parseOr400 } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const REQUEST_ID_HEADER = "x-request-id";


export async function GET(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(req, "GET /api/v1/documents"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited — try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 60) }
    );
  }

  const raw = {
    status: req.nextUrl.searchParams.get("status") ?? undefined,
    take: req.nextUrl.searchParams.get("take") ?? undefined,
    skip: req.nextUrl.searchParams.get("skip") ?? undefined,
  };
  const parsed = parseOr400(PaginationSchema, raw);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 60) });
  }

  const { status, take, skip } = parsed.data;
  const where = status ? { status } : undefined;

  const docs = await db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take,
    skip,
    include: { findings: true, transformations: true, intelligence: true },
  });

  return NextResponse.json(
    { documents: docs.map(serializeDocument) },
    { headers: rateLimitHeaders(rl, 60) }
  );
}


export async function POST(req: NextRequest) {
  const _auth = requireApiAuth(req);
  if (_auth) return _auth;
  const rl = checkRateLimit(rateLimitKey(req, "POST /api/v1/documents"), { max: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Rate limited — try again shortly." },
      { status: 429, headers: rateLimitHeaders(rl, 20) }
    );
  }

  const correlationId = req.headers.get(REQUEST_ID_HEADER) ?? crypto.randomUUID();
  const contentType = req.headers.get("content-type") ?? "";

  let filename = "pasted-document.txt";
  let mimeType = "text/plain";
  let content = "";
  let parsedMeta: Record<string, unknown> = {};
  let warnings: string[] = [];
  let sourceKind: "UPLOAD" | "PASTE" | "SAMPLE" = "PASTE";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const title = (form.get("title") as string) || undefined;
      if (file instanceof File) {
        // Reject oversized uploads before arrayBuffer() loads bytes.
        const preLimit = /^(video\/|audio\/)/.test(file.type || "") || /\.(mp4|mov|webm|avi|mp3|wav|ogg)$/i.test(file.name || "") ? 25 * 1024 * 1024 : 10 * 1024 * 1024;
        if (file.size > preLimit) {
          return NextResponse.json({ error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is ${preLimit / 1024 / 1024} MB.` }, { status: 400, headers: rateLimitHeaders(rl, 20) });
        }
        filename = sanitizeFilename(file.name);
        mimeType = file.type || "application/octet-stream";
        const buf = Buffer.from(await file.arrayBuffer());
        try {
          const parsed = await parseDocument({ filename, mimeType, buffer: buf });
          content = parsed.text;
          parsedMeta = {
            ...parsed.metadata,
            sha256: parsed.sha256,
            pages: parsed.pages,
            sections: parsed.sections,
            charCount: parsed.charCount,
            wordCount: parsed.wordCount,
            warnings: parsed.warnings,
          };
          warnings = parsed.warnings;
          if (!content.trim()) {
            const hint = warnings.length ? ` — ${warnings[0]}` : "";
            return NextResponse.json({ error: `No extractable text found in "${filename}"${hint}. For images or scanned PDFs, enable OCR via Docling worker or paste the content as text.` }, { status: 400, headers: rateLimitHeaders(rl, 20) });
          }
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "File parsing failed.";
          return NextResponse.json({ error: msg }, { status: 400, headers: rateLimitHeaders(rl, 20) });
        }
        sourceKind = "UPLOAD";
        const doc = await createDocument({ filename, mimeType, content, sourceKind, title, parsedMeta, warnings });
        return NextResponse.json({ document: serializeDocument(doc) }, { status: 201, headers: rateLimitHeaders(rl, 20) });
      }
      if (title) {

        if (title.length > 200) {
          return NextResponse.json({ error: "title: must be 200 characters or fewer." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
        }
        const rawContent = (form.get("content") as string) || "";
        if (rawContent.length > 200_000) {
          return NextResponse.json({ error: "content: must be 200,000 characters or fewer." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
        }
        const { normalizeIngestedText: normalizeForm } = await import("@/lib/text");
        content = normalizeForm(rawContent);
        if (!content.trim()) {
          return NextResponse.json({ error: "Content is empty after sanitization." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
        }
        filename = sanitizeFilename(title);
        const doc = await createDocument({ filename, mimeType, content, sourceKind, title: filename });
        return NextResponse.json({ document: serializeDocument(doc) }, { status: 201, headers: rateLimitHeaders(rl, 20) });
      }
      return NextResponse.json({ error: "No file or content provided." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
    }

    const body: unknown = await req.json().catch(() => ({}));
    const parsed = parseOr400(DocumentUploadJsonSchema, body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 20) });
    }
    const p = parsed.data as { sampleId?: string; content?: string; title?: string };
    if (p.sampleId) {
      const sample = SAMPLE_DOCUMENTS.find((s) => s.id === p.sampleId);
      if (!sample) {
        return NextResponse.json({ error: "Unknown sample id." }, { status: 404, headers: rateLimitHeaders(rl, 20) });
      }
      const doc = await createDocument({
        filename: `${sample.id}.txt`,
        mimeType: "text/plain",
        content: sample.content,
        sourceKind: "SAMPLE",
        title: sample.title,
      });
      await logAudit({ documentId: doc.id, actor: "analyst", action: "UPLOAD", detail: `Loaded sample "${sample.title}" (${sample.category}).` });
      return NextResponse.json({ document: serializeDocument(doc) }, { status: 201, headers: rateLimitHeaders(rl, 20) });
    }

    if (typeof p.content === "string" && p.content.trim()) {
      const { normalizeIngestedText } = await import("@/lib/text");
      content = normalizeIngestedText(p.content);
      if (!content.trim()) {
        return NextResponse.json({ error: "Content is empty after sanitization — check for binary or unsupported encoding." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
      }
      filename = sanitizeFilename(p.title || "pasted-document.txt");
      mimeType = "text/plain";
      sourceKind = "PASTE";
      const doc = await createDocument({ filename, mimeType, content, sourceKind, title: filename });
      return NextResponse.json({ document: serializeDocument(doc) }, { status: 201, headers: rateLimitHeaders(rl, 20) });
    }

    return NextResponse.json({ error: "Provide a file, sampleId, or content." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
  } catch (e: unknown) {
    console.error(`[documents POST] correlation=${correlationId}`, e);
    const msg = e instanceof Error ? e.message : "Upload failed.";
    const isExpected = msg.includes("too large") || msg.includes("parsing") || msg.includes("empty") || msg.includes("OCR") || msg.includes("No extractable");
    const isUserError = msg.includes("empty") || msg.includes("OCR") || msg.includes("No extractable");
    return NextResponse.json({ error: isExpected ? msg : "Upload failed." }, { status: isUserError ? 400 : isExpected ? 400 : 500, headers: rateLimitHeaders(rl, 20) });
  }
}
