// Intelligence persistence service

import { db } from "@/lib/db";
import { buildIntelligenceReport } from "./extractor";
import { scanContent } from "@/lib/security";
import { computeRisk } from "@/lib/security/risk";
import type { IntelligenceReport } from "@/types";
import { serializeIntelligence } from "@/lib/api/helpers";

export async function ensureIntelligence(documentId: string, opts: { force?: boolean } = {}): Promise<IntelligenceReport | null> {
  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return null;

  const existing = await db.intelligenceReport.findUnique({ where: { documentId } });
  if (existing && !opts.force) {
    return serializeIntelligence(existing);
  }

  const rawFindings = scanContent(doc.rawContent);
  const risk = computeRisk(rawFindings);

  const built = buildIntelligenceReport({
    documentId: doc.id,
    rawContent: doc.rawContent,
    findings: rawFindings,
    classification: risk.classification as any,
    riskScore: risk.total,
  });

  const saved = await db.intelligenceReport.upsert({
    where: { documentId },
    create: {
      documentId,
      entities: JSON.stringify(built.entities),
      iocs: JSON.stringify(built.iocs),
      ttps: JSON.stringify(built.ttps),
      risks: JSON.stringify(built.risks),
      keyFindings: JSON.stringify(built.keyFindings),
      evidence: JSON.stringify(built.evidence),
      summary: built.summary,
      riskScore: built.riskScore,
      classification: built.classification,
      model: built.model,
    },
    update: {
      entities: JSON.stringify(built.entities),
      iocs: JSON.stringify(built.iocs),
      ttps: JSON.stringify(built.ttps),
      risks: JSON.stringify(built.risks),
      keyFindings: JSON.stringify(built.keyFindings),
      evidence: JSON.stringify(built.evidence),
      summary: built.summary,
      riskScore: built.riskScore,
      classification: built.classification,
      model: built.model,
    },
  });

  await db.auditLog.create({
    data: {
      documentId,
      actor: "intelligence_engine",
      action: "INTELLIGENCE_EXTRACT",
      detail: `Extracted ${built.entities.length} entities, ${built.iocs.length} IOCs, ${built.ttps.length} TTPs, ${built.keyFindings.length} key findings.`,
    },
  }).catch(() => {});

  return serializeIntelligence(saved);
}

export async function getIntelligence(documentId: string): Promise<IntelligenceReport | null> {
  const existing = await db.intelligenceReport.findUnique({ where: { documentId } });
  if (existing) return serializeIntelligence(existing);
  return ensureIntelligence(documentId);
}
