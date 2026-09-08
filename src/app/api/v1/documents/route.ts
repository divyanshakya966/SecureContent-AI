import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit } from "@/lib/api/helpers";
import { scanContent, computeRisk } from "@/lib/security";
import { SAMPLE_DOCUMENTS } from "@/lib/security/samples";
import { parseDocument } from "@/lib/parsers";

export const runtime = "nodejs";

// GET /api/v1/documents — list documents (optional ?status= filter)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const where = status ? { status } : undefined;
  const docs = await db.document.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json({ documents: docs.map(serializeDocument) });
}

// POST /api/v1/documents — upload a new document (multipart or JSON)
// Trust boundary T1 (Browser -> Backend) + T2 (Backend -> Parser):
// validate size/type, isolate parser errors, never treat file bytes as trusted.
export async function POST(req: NextRequest) {
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
        // Use ArrayBuffer + parser so PDF/DOCX binaries are not mis-decoded as UTF-8 text
        const buf = Buffer.from(await file.arrayBuffer());
        try {
          const parsed = await parseDocument({ filename, mimeType, buffer: buf });
          content = parsed.text;
          parsedMeta = { ...parsed.metadata, sha256: parsed.sha256, pages: parsed.pages, sections: parsed.sections, charCount: parsed.charCount, wordCount: parsed.wordCount, warnings: parsed.warnings };
          warnings = parsed.warnings;
        } catch (e: any) {
          return NextResponse.json({ error: e?.message ?? "File parsing failed." }, { status: 400 });
        }
        sourceKind = "UPLOAD";
        const doc = await createDocument({ filename, mimeType, content, sourceKind, title, parsedMeta, warnings });
        return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
      }
      if (title) {
        // paste via form
        content = (form.get("content") as string) || "";
        filename = title;
        const doc = await createDocument({ filename, mimeType, content, sourceKind, title });
        return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
      }
      return NextResponse.json({ error: "No file or content provided." }, { status: 400 });
    }

    // JSON body: either a sample id, or raw paste content
    const body = await req.json().catch(() => ({} as any));
    if (body.sampleId) {
      const sample = SAMPLE_DOCUMENTS.find((s) => s.id === body.sampleId);
      if (!sample) {
        return NextResponse.json({ error: "Unknown sample id." }, { status: 404 });
      }
      const doc = await createDocument({
        filename: `${sample.id}.txt`,
        mimeType: "text/plain",
        content: sample.content,
        sourceKind: "SAMPLE",
        title: sample.title,
      });
      await logAudit({ documentId: doc.id, actor: "analyst", action: "UPLOAD", detail: `Loaded sample "${sample.title}" (${sample.category}).` });
      return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
    }

    if (typeof body.content === "string" && body.content.trim()) {
      content = body.content;
      filename = body.title || "pasted-document.txt";
      mimeType = "text/plain";
      sourceKind = "PASTE";
      const doc = await createDocument({ filename, mimeType, content, sourceKind, title: body.title || filename });
      return NextResponse.json({ document: serializeDocument(doc) }, { status: 201 });
    }

    return NextResponse.json({ error: "Provide a file, sampleId, or content." }, { status: 400 });
  } catch (e: any) {
    console.error("[documents POST]", e);
    return NextResponse.json({ error: e?.message ?? "Upload failed." }, { status: 500 });
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
  const { filename, mimeType, content, sourceKind } = opts;
  const title = opts.title || filename.replace(/\.[^.]+$/, "");

  // If the parser already provided hashes/stats, reuse them; otherwise compute here.
  const metaFromParser = opts.parsedMeta;
  const sha256 = (metaFromParser?.sha256 as string) || (await import("crypto")).createHash("sha256").update(content).digest("hex");
  const charCount = (metaFromParser?.charCount as number) ?? content.length;
  const wordCount = (metaFromParser?.wordCount as number) ?? content.trim().split(/\s+/).filter(Boolean).length;
  const pages = (metaFromParser?.pages as number) ?? Math.max(1, Math.ceil(content.split(/\r?\n/).length / 40));
  const sections = (metaFromParser?.sections as number) ?? Math.max(1, content.split(/\n\s*\n/).filter((p) => p.trim()).length);

  // Eagerly run the security scan so the dashboard reflects risk immediately.
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

  await logAudit({
    documentId: doc.id,
    actor: "analyst",
    action: "UPLOAD",
    detail: `Ingested "${title}" (${mimeType}, ${wordCount} words). Initial risk ${risk.total}/100, classification ${risk.classification}.`,
  });

  return doc;
}
