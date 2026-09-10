import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/api/helpers";
import { scanContent, sanitizeContent, computeRisk, transformContent, runOutputDlp, SAMPLE_DOCUMENTS } from "@/lib/security";
import { buildIntelligenceReport } from "@/lib/intelligence/extractor";
import { getPolicyByName } from "@/lib/api/helpers";
import type { RawFinding } from "@/lib/security";
import type { TransformationProfile, OutputType } from "@/types";

export const runtime = "nodejs";

// POST /api/v1/seed — ingest all 5 attack samples through the full pipeline
// so the dashboard shows realistic data immediately. Idempotent: skips samples
// already ingested by title.
export async function POST() {
  const results: { title: string; status: string; risk: number }[] = [];

  for (const sample of SAMPLE_DOCUMENTS) {
    // Skip if a sample with the same title already exists.
    const existing = await db.document.findFirst({ where: { title: sample.title, sourceKind: "SAMPLE" } });
    if (existing) {
      results.push({ title: sample.title, status: "skipped (exists)", risk: existing.riskScore });
      continue;
    }

    const rawFindings = scanContent(sample.content);
    const risk = computeRisk(rawFindings);

    const doc = await db.document.create({
      data: {
        filename: `${sample.id}.txt`,
        mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(sample.content, "utf8"),
        title: sample.title,
        sourceKind: "SAMPLE",
        classification: risk.classification,
        status: "SCANNED",
        riskScore: risk.total,
        riskBefore: risk.total,
        riskAfter: 0,
        rawContent: sample.content,
        metadata: JSON.stringify({
          charCount: sample.content.length,
          wordCount: sample.content.trim().split(/\s+/).length,
          pages: 1,
          sections: sample.content.split(/\n\s*\n/).length,
          sourceFormat: "text/plain",
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
    });

    await logAudit({
      documentId: doc.id,
      actor: "analyst",
      action: "UPLOAD",
      detail: `Seeded sample "${sample.title}" (${sample.category}). Risk ${risk.total}/100, ${rawFindings.length} findings.`,
    });

    // Intelligence-Aware Extraction (signature innovation #2) — run immediately after scan
    try {
      const intel = buildIntelligenceReport({
        documentId: doc.id,
        rawContent: sample.content,
        findings: rawFindings,
        classification: risk.classification as any,
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
        detail: `Intelligence: ${intel.entities.length} entities, ${intel.iocs.length} IOCs, ${intel.ttps.length} TTPs.`,
      });
    } catch {}

    // Choose a profile + output type that best demonstrate the pipeline.
    const profile: TransformationProfile = sample.category === "INJECTION" || sample.category === "MIXED"
      ? "SECURITY_INCIDENT"
      : sample.category === "SECRET_HEAVY"
      ? "SECURITY_INCIDENT"
      : sample.category === "PII_HEAVY"
      ? "PUBLIC_RELEASE"
      : "INTERNAL_SUMMARY";
    const outputType: OutputType = sample.category === "MIXED" ? "TECHNICAL_REPORT" : "EXECUTIVE_SUMMARY";

    const policy = await getPolicyByName(profile);
    if (!policy) {
      results.push({ title: sample.title, status: "no policy", risk: risk.total });
      continue;
    }

    // Reconstruct RawFinding offsets and sanitize.
    const findings: RawFinding[] = rawFindings;
    const sanitized = sanitizeContent(sample.content, findings, policy);

    const residualFindings = scanContent(sanitized.sanitizedContent);
    const residualRisk = computeRisk(residualFindings);

    await db.document.update({
      where: { id: doc.id },
      data: {
        sanitizedContent: sanitized.sanitizedContent,
        status: sanitized.blocked ? "BLOCKED" : "SANITIZED",
        riskAfter: sanitized.blocked ? risk.total : residualRisk.total,
      },
    });

    await logAudit({
      documentId: doc.id,
      actor: "policy_engine",
      action: "POLICY_APPLY",
      detail: sanitized.blocked
        ? `Policy "${policy.name}" BLOCKED transformation.`
        : `Policy "${policy.name}" applied — ${sanitized.actions.length} actions, residual risk ${residualRisk.total}/100.`,
    });

    if (sanitized.blocked) {
      results.push({ title: sample.title, status: "blocked", risk: risk.total });
      continue;
    }

    // Transform with the LLM.
    try {
      const tx = await transformContent({
        sanitizedContent: sanitized.sanitizedContent,
        outputType,
        profile,
        sourceTitle: sample.title,
      });

      const dlp = runOutputDlp(tx.content, policy);
      const finalContent = dlp.passed ? tx.content : dlp.repairedContent;
      const outputFindings = scanContent(finalContent);
      const outputRisk = computeRisk(outputFindings);

      await db.transformation.create({
        data: {
          documentId: doc.id,
          profile,
          outputType,
          model: tx.model,
          outputContent: finalContent,
          grounding: tx.citations.some((c) => !c.grounded) ? "FAIL" : "PASS",
          policyStatus: "PASS",
          outputDlp: dlp.passed ? "PASS" : "FAIL",
          riskDelta: risk.total - outputRisk.total,
          leakageCount: dlp.leakageFindings.length,
          citations: JSON.stringify(tx.citations),
        },
      });

      await db.document.update({ where: { id: doc.id }, data: { status: "TRANSFORMED" } });

      await logAudit({
        documentId: doc.id,
        actor: "llm_adapter",
        action: "TRANSFORM",
        detail: `Transformed via "${profile}" → ${outputType} (${tx.model}). DLP=${dlp.passed ? "PASS" : "FAIL"}, leakage=${dlp.leakageFindings.length}.`,
      });
      await logAudit({
        documentId: doc.id,
        actor: "output_validator",
        action: dlp.passed ? "RELEASE" : "DLP_BLOCK",
        detail: dlp.passed
          ? "Output passed DLP and grounding; released."
          : `Output DLP flagged ${dlp.leakageFindings.length} leakage candidate(s); repaired automatically.`,
      });

      results.push({ title: sample.title, status: "transformed", risk: risk.total });
    } catch (e: any) {
      results.push({ title: sample.title, status: `transform failed: ${e?.message}`, risk: risk.total });
    }
  }

  return NextResponse.json({ seeded: results });
}
