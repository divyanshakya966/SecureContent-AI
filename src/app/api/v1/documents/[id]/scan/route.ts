import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scanContent, computeRisk } from "@/lib/security";
import type { ScanConfig } from "@/types";
import { serializeDocument, logAudit } from "@/lib/api/helpers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { requireApiAuth } from "@/lib/auth";
import { DocumentIdSchema, ScanConfigSchema, parseOr400 } from "@/lib/validation/schemas";
import { buildIntelligenceReport } from "@/lib/intelligence/extractor";

export const runtime = "nodejs";


export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _auth = requireApiAuth(req);
  if (_auth) return _auth;
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `POST /scan:${id}`), { max: 15, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 15) });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 15) });

  // Optional scan config; otherwise reuse the stored one.
  const body: unknown = await req.json().catch(() => ({}));
  const rawConfig = (body as { config?: unknown }).config;
  let scanConfig: ScanConfig;
  if (rawConfig === undefined) {
    try {
      scanConfig = ((JSON.parse(doc.metadata ?? "{}") as { scanConfig?: ScanConfig }).scanConfig ?? {
        pii: true, secrets: true, injections: true, internalAssets: true, unsafeUrls: true, minConfidence: 0,
      });
    } catch {
      scanConfig = { pii: true, secrets: true, injections: true, internalAssets: true, unsafeUrls: true, minConfidence: 0 };
    }
  } else {
    const cfgParsed = parseOr400(ScanConfigSchema, rawConfig);
    if (!cfgParsed.ok) return NextResponse.json({ error: cfgParsed.error }, { status: 400, headers: rateLimitHeaders(rl, 15) });
    scanConfig = cfgParsed.data as ScanConfig;
  }

  const rawFindings = scanContent(doc.rawContent, scanConfig);
  const risk = computeRisk(rawFindings);


  let scanMeta: Record<string, unknown> = {};
  try {
    scanMeta = JSON.parse(doc.metadata ?? "{}");
  } catch {
    scanMeta = {};
  }
  delete scanMeta.sanitizedPolicy;
  delete scanMeta.sanitizedAt;
  scanMeta.scanConfig = scanConfig;
  const scanMetadata = JSON.stringify(scanMeta);


  await db.$transaction(async (tx) => {
    await tx.finding.deleteMany({ where: { documentId: id, stage: "INPUT" } });
    if (rawFindings.length) {
      await tx.finding.createMany({
        data: rawFindings.map((f) => ({
          documentId: id,
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
      });
    }
    await tx.document.update({
      where: { id },
      data: {
        riskScore: risk.total,
        riskBefore: risk.total,
        classification: risk.classification,
        status: "SCANNED",

        sanitizedContent: null,
        riskAfter: 0,
        metadata: scanMetadata,
      },
    });
  });

  try {
    const intel = buildIntelligenceReport({
      documentId: id,
      rawContent: doc.rawContent,
      findings: rawFindings,
      classification: risk.classification,
      riskScore: risk.total,
    });
    await db.intelligenceReport.upsert({
      where: { documentId: id },
      create: {
        documentId: id,
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
      update: {
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
  } catch {}

  await logAudit({
    documentId: id,
    actor: "policy_engine",
    action: "SCAN",
    detail: `Re-scanned "${doc.title}". Risk ${risk.total}/100, ${rawFindings.length} findings, classification ${risk.classification}. Config: pii=${scanConfig.pii}, secrets=${scanConfig.secrets}, injections=${scanConfig.injections}, internal=${scanConfig.internalAssets}, urls=${scanConfig.unsafeUrls}, minConf=${scanConfig.minConfidence ?? 0}.`,
  });

  const fresh = await db.document.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } }, transformations: true, intelligence: true },
  });

  const updatedDoc = fresh ?? (await db.document.findUnique({ where: { id }, include: { findings: true, transformations: true, intelligence: true } }));
  return NextResponse.json(
    { document: updatedDoc ? serializeDocument(updatedDoc) : null, risk },
    { headers: rateLimitHeaders(rl, 15) }
  );
}
