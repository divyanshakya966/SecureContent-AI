// Shared ingestion: normalize, scan, classify, store, audit.

import { db } from "@/lib/db";
import { serializeDocument, logAudit } from "@/lib/api/helpers";
import { scanContent, computeRisk } from "@/lib/security";
import { buildIntelligenceReport } from "@/lib/intelligence/extractor";

/** Strip path components, control chars, and brackets from client filenames; cap length. */
export function sanitizeFilename(name: string): string {
  const base = (name || "upload").split(/[\\/]/).pop() || "upload";
  return base.replace(/[\x00-\x1F\x7F\[\]\n\r]/g, "").trim().slice(0, 120) || "upload";
}
export interface IngestOptions {
  filename: string;
  mimeType: string;
  content: string;
  sourceKind: "UPLOAD" | "PASTE" | "SAMPLE";
  title?: string;
  parsedMeta?: Record<string, unknown>;
  warnings?: string[];
}

/** Normalize → scan → classify → store (with findings + intelligence) → audit. */
export async function ingestDocument(opts: IngestOptions) {
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
