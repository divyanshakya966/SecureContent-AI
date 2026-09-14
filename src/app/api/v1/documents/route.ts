import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit } from "@/lib/api/helpers";
import { scanContent, computeRisk } from "@/lib/security";
import { buildIntelligenceReport } from "@/lib/intelligence/extractor";
import { SAMPLE_DOCUMENTS } from "@/lib/security/samples";
import { parseDocument } from "@/lib/parsers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { DocumentUploadJsonSchema, PaginationSchema, parseOr400 } from "@/lib/validation/schemas";

export const runtime = "nodejs";

const REQUEST_ID_HEADER = "x-request-id";

// GET /api/v1/documents — list documents (optional ?status=, ?take=, ?skip=)
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

// POST /api/v1/documents — upload a new document (multipart or JSON)
// Trust boundary T1 (Browser -> Backend) + T2 (Backend -> Parser):
// validate size/type, isolate parser errors, never treat file bytes as trusted.
export async function POST(req: NextRequest) {
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
        filename = file.name;
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
        const rawContent = (form.get("content") as string) || "";
        const { normalizeIngestedText: normalizeForm } = await import("@/lib/text");
        content = normalizeForm(rawContent);
        if (!content.trim()) {
          return NextResponse.json({ error: "Content is empty after sanitization." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
        }
        filename = title;
        const doc = await createDocument({ filename, mimeType, content, sourceKind, title });
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
      filename = p.title || "pasted-document.txt";
      mimeType = "text/plain";
      sourceKind = "PASTE";
      const doc = await createDocument({ filename, mimeType, content, sourceKind, title: p.title || filename });
      return NextResponse.json({ document: serializeDocument(doc) }, { status: 201, headers: rateLimitHeaders(rl, 20) });
    }

    return NextResponse.json({ error: "Provide a file, sampleId, or content." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
  } catch (e: unknown) {
    console.error(`[documents POST] correlation=${correlationId}`, e);
    const msg = e instanceof Error ? e.message : "Upload failed.";
    // Do not leak internal stack; return generic message for unexpected errors.
    const isExpected = msg.includes("too large") || msg.includes("parsing") || msg.includes("empty") || msg.includes("OCR") || msg.includes("No extractable");
    // Empty/OCR failures are user errors → 400
    const isUserError = msg.includes("empty") || msg.includes("OCR") || msg.includes("No extractable");
    return NextResponse.json({ error: isExpected ? msg : "Upload failed." }, { status: isUserError ? 400 : isExpected ? 400 : 500, headers: rateLimitHeaders(rl, 20) });
  }
}

async function createDocument(opts: {
  filename: string;
  mimeType: string;
  content: string;
  sourceKind: "UPLOAD" | "PASTE" | "SAMPLE";
  title?: string;
  parsedMeta?: Record<string, unknown>;
  warnings?: string[];
}) {
  const { normalizeIngestedText: normalizeCreate } = await import("@/lib/text");
  const rawInput = opts.content;
  const content = normalizeCreate(rawInput);
  if (!content.trim()) {
    throw new Error("Document is empty after text normalization — upload a text-based file or enable OCR.");
  }
  const { filename, mimeType, sourceKind } = opts;
  const title = opts.title || filename.replace(/\.[^.]+$/, "");

  const metaFromParser = opts.parsedMeta;
  const sha256 = (metaFromParser?.sha256 as string) || (await import("crypto")).createHash("sha256").update(content).digest("hex");
  const charCount = (metaFromParser?.charCount as number) ?? content.length;
  const wordCount = (metaFromParser?.wordCount as number) ?? content.trim().split(/\s+/).filter(Boolean).length;
  const pages = (metaFromParser?.pages as number) ?? Math.max(1, Math.ceil(content.split(/\r?\n/).length / 40));
  const sections = (metaFromParser?.sections as number) ?? Math.max(1, content.split(/\n\s*\n/).filter((p) => p.trim()).length);

  const rawFindings = scanContent(content);
  const risk = computeRisk(rawFindings);

  const doc = await db.document.create({
    data: {
      filename,
      mimeType,
      sizeBytes: Buffer.byteLength(content, "utf8"),
      title,
      sourceKind,
      classification: risk.classification,
      status: "SCANNED",
      riskScore: risk.total,
      riskBefore: risk.total,
      riskAfter: 0,
      rawContent: content,
      metadata: JSON.stringify({
        sha256,
        charCount,
        wordCount,
        pages,
        sections,
        sourceFormat: mimeType,
        parser: (metaFromParser?.parser as string) || "direct",
        warnings: opts.warnings ?? [],
        ...(metaFromParser || {}),
      }),
      findings: {
        create: rawFindings.map((f) => ({
          category: f.category,
          type: f.type,
          severity: f.severity,
          confidence: f.confidence,
          action: f.defaultAction,
          stage: f.stage,
          location: `char_offset:${f.start}-${f.end}`,
          matchedText: f.matchedText,
          maskedText: f.maskedText,
          reason: f.reason,
        })),
      },
    },
    include: { findings: true },
  });

  try {
    const intel = buildIntelligenceReport({
      documentId: doc.id,
      rawContent: content,
      findings: rawFindings,
      classification: risk.classification,
      riskScore: risk.total,
    });
    await db.intelligenceReport.create({
      data: {
        documentId: doc.id,
        entities: JSON.stringify(intel.entities),
        iocs: JSON.stringify(intel.iocs),
        ttps: JSON.stringify(intel.ttps),
        risks: JSON.stringify(intel.risks),
        keyFindings: JSON.stringify(intel.keyFindings),
        evidence: JSON.stringify(intel.evidence),
        summary: intel.summary,
        riskScore: intel.riskScore,
        classification: intel.classification,
        model: intel.model,
      },
    });
    await logAudit({
      documentId: doc.id,
      actor: "intelligence_engine",
      action: "INTELLIGENCE_EXTRACT",
      detail: `Intelligence extracted: ${intel.entities.length} entities, ${intel.iocs.length} IOCs, ${intel.ttps.length} TTPs.`,
    });
  } catch (e) {
    console.warn("[intelligence] extraction failed:", e);
  }

  const full = await db.document.findUnique({
    where: { id: doc.id },
    include: { findings: true, intelligence: true, transformations: true },
  });

  await logAudit({
    documentId: doc.id,
    actor: "analyst",
    action: "UPLOAD",
    detail: `Ingested "${title}" (${mimeType}, ${wordCount} words). Initial risk ${risk.total}/100, classification ${risk.classification}.`,
  });

  return full ?? doc;
}
