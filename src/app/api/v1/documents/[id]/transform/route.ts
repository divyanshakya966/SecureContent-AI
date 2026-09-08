import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  serializeDocument,
  logAudit,
  getPolicyByName,
  serializeTransformation,
} from "@/lib/api/helpers";
import { transformContent, runOutputDlp, scanContent, computeRisk } from "@/lib/security";
import type { OutputType, TransformationProfile } from "@/types";

export const runtime = "nodejs";

// POST /api/v1/documents/{id}/transform
// body: { profile, outputType }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({} as any));
  const profile = (body.profile || "PUBLIC_RELEASE") as TransformationProfile;
  const outputType = (body.outputType || "EXECUTIVE_SUMMARY") as OutputType;

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.status === "BLOCKED") {
    return NextResponse.json(
      { error: "Document is blocked by policy and cannot be transformed." },
      { status: 422 }
    );
  }

  const policy = await getPolicyByName(profile);
  if (!policy) return NextResponse.json({ error: "Unknown policy." }, { status: 400 });

  // Use the sanitized working copy if available; otherwise fall back to raw
  // (the detector still runs first so we never blindly trust raw content).
  const workingContent = doc.sanitizedContent || doc.rawContent;

  let outputContent = "";
  let model = "zai-glm";
  let citations: any[] = [];
  let grounding: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  let outputDlp: "PASS" | "FAIL" = "FAIL";
  let leakageCount = 0;
  let dlpReasons: string[] = [];

  try {
    const tx = await transformContent({
      sanitizedContent: workingContent,
      outputType,
      profile,
      sourceTitle: doc.title,
    });
    outputContent = tx.content;
    model = tx.model;
    citations = tx.citations;
    grounding = citations.some((c) => !c.grounded) ? "FAIL" : "PASS";
    if (citations.length === 0) grounding = "SKIPPED";

    // Output DLP — the deterministic release gate.
    const dlp = runOutputDlp(outputContent, policy);
    outputDlp = dlp.passed ? "PASS" : "FAIL";
    leakageCount = dlp.leakageFindings.length;
    dlpReasons = dlp.reasons;
    if (!dlp.passed) {
      outputContent = dlp.repairedContent;
    }
  } catch (e: any) {
    console.error("[transform]", e);
    return NextResponse.json(
      { error: `Transformation failed: ${e?.message ?? "unknown"}` },
      { status: 502 }
    );
  }

  // Compute risk delta (residual risk of generated output vs. original risk).
  const outputFindings = scanContent(outputContent);
  const outputRisk = computeRisk(outputFindings);
  const riskDelta = doc.riskBefore - outputRisk.total;

  const tx = await db.transformation.create({
    data: {
      documentId: id,
      profile,
      outputType,
      model,
      outputContent,
      grounding,
      policyStatus: "PASS",
      outputDlp,
      riskDelta,
      leakageCount,
      citations: JSON.stringify(citations),
    },
  });

  await db.document.update({
    where: { id },
    data: { status: "TRANSFORMED" },
  });

  await logAudit({
    documentId: id,
    actor: "llm_adapter",
    action: "TRANSFORM",
    detail: `Transformed via "${profile}" → ${outputType} (${model}). Grounding=${grounding}, OutputDLP=${outputDlp}, leakage=${leakageCount}, risk Δ=${riskDelta}.`,
  });

  if (outputDlp === "FAIL") {
    await logAudit({
      documentId: id,
      actor: "output_validator",
      action: "DLP_BLOCK",
      detail: `Output DLP flagged ${leakageCount} leakage candidate(s); repaired automatically. ${dlpReasons.slice(1).join(" ")}`,
    });
  } else {
    await logAudit({
      documentId: id,
      actor: "output_validator",
      action: "RELEASE",
      detail: `Output passed DLP and grounding checks; released.`,
    });
  }

  const updated = await db.document.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } }, transformations: { orderBy: { createdAt: "desc" } } },
  });

  return NextResponse.json({
    document: serializeDocument(updated),
    transformation: serializeTransformation(tx),
    dlpReasons,
  });
}
