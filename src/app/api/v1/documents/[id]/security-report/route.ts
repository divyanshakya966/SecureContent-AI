import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SecurityReport, Severity } from "@/types";
import { computeRisk, scanContent } from "@/lib/security";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      findings: { orderBy: { createdAt: "asc" } },
      transformations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const inputFindings = doc.findings.filter((f) => f.stage === "INPUT");
  const outputFindings = doc.findings.filter((f) => f.stage === "OUTPUT");
  const risk = computeRisk(
    inputFindings.map((f) => {
      const m = /char_offset:(\d+)-(\d+)/.exec(f.location || "");
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m ? parseInt(m[2], 10) : start;
      return {
        category: f.category as any,
        type: f.type as any,
        severity: f.severity as any,
        confidence: f.confidence,
        defaultAction: f.action as any,
        stage: "INPUT",
        start, end,
        matchedText: f.matchedText,
        maskedText: f.maskedText,
        reason: f.reason,
      };
    })
  );

  const severityBreakdown: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const f of inputFindings) severityBreakdown[f.severity as Severity]++;

  const latest = doc.transformations[0];
  const sanitized = doc.sanitizedContent || doc.rawContent;
  const preview = sanitized.length > 600 ? sanitized.slice(0, 600) + "…" : sanitized;

  const report: SecurityReport = {
    documentId: doc.id,
    riskScore: doc.riskScore,
    riskBefore: doc.riskBefore,
    riskAfter: doc.riskAfter,
    classification: doc.classification as any,
    findings: {
      pii: inputFindings.filter((f) => f.category === "PII").length,
      secrets: inputFindings.filter((f) => f.category === "SECRET").length,
      promptInjection: inputFindings.filter((f) => f.category === "PROMPT_INJECTION").length,
      internalAssets: inputFindings.filter((f) => f.category === "INTERNAL_ASSET").length,
      unsafeUrls: inputFindings.filter((f) => f.category === "UNSAFE_URL").length,
      outputLeakage: outputFindings.length + (latest?.leakageCount ?? 0),
    },
    severityBreakdown,
    grounding: (latest?.grounding ?? "SKIPPED") as any,
    policyStatus: (latest?.policyStatus ?? "SKIPPED") as any,
    outputDlp: (latest?.outputDlp ?? "SKIPPED") as any,
    topFindings: inputFindings
      .slice()
      .sort((a, b) => (b.confidence - a.confidence))
      .slice(0, 8)
      .map((f) => ({
        id: f.id,
        documentId: doc.id,
        category: f.category as any,
        type: f.type as any,
        severity: f.severity as any,
        confidence: f.confidence,
        action: f.action as any,
        stage: f.stage as any,
        location: f.location,
        matchedText: f.matchedText,
        maskedText: f.maskedText,
        reason: f.reason,
        createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
      })),
    sanitizedPreview: preview,
    generatedAt: new Date().toISOString(),
  };

  // Risk breakdown for the chart
  return NextResponse.json({ report, riskBreakdown: risk });
}
