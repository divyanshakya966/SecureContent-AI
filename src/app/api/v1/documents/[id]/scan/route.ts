import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scanContent, computeRisk } from "@/lib/security";
import { serializeDocument, logAudit } from "@/lib/api/helpers";

export const runtime = "nodejs";

// POST /api/v1/documents/{id}/scan — re-run the security gateway on rawContent
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rawFindings = scanContent(doc.rawContent);
  const risk = computeRisk(rawFindings);

  // Replace INPUT findings (OUTPUT findings stay for audit)
  await db.finding.deleteMany({ where: { documentId: id, stage: "INPUT" } });
  if (rawFindings.length) {
    await db.finding.createMany({
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

  const updated = await db.document.update({
    where: { id },
    data: {
      riskScore: risk.total,
      riskBefore: risk.total,
      classification: risk.classification,
      status: "SCANNED",
    },
    include: { findings: { orderBy: { createdAt: "asc" } }, transformations: true },
  });

  await logAudit({
    documentId: id,
    actor: "policy_engine",
    action: "SCAN",
    detail: `Re-scanned "${doc.title}". Risk ${risk.total}/100, ${rawFindings.length} findings, classification ${risk.classification}.`,
  });

  return NextResponse.json({ document: serializeDocument(updated), risk });
}
