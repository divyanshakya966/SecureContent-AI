import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  serializeDocument,
  logAudit,
  getPolicyByName,
  serializeTransformation,
} from "@/lib/api/helpers";
import { transformContent, runOutputDlp, scanContent, computeRisk, sanitizeOutputHtml } from "@/lib/security";
import { TransformSchema, DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import type { OutputType, TransformationProfile } from "@/types";

export const runtime = "nodejs";

// POST /api/v1/documents/{id}/transform — body: { profile, outputType }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `POST /transform:${id}`), { max: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 10) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(TransformSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 10) });
  const { profile, outputType } = parsed.data as { profile: TransformationProfile; outputType: OutputType };

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 10) });
  if (doc.status === "BLOCKED") {
    return NextResponse.json(
      { error: "Document is blocked by policy and cannot be transformed." },
      { status: 422, headers: rateLimitHeaders(rl, 10) }
    );
  }

  const policy = await getPolicyByName(profile);
  if (!policy) return NextResponse.json({ error: "Unknown policy." }, { status: 400, headers: rateLimitHeaders(rl, 10) });

  // Enforce sanitize-before-transform: if no sanitized copy exists, require it.
  // This prevents raw injection content from reaching the LLM even if the envelope mitigates it.
  if (!doc.sanitizedContent) {
    return NextResponse.json(
      { error: "Document must be sanitized before transformation. Call POST /sanitize first." },
      { status: 422, headers: rateLimitHeaders(rl, 10) }
    );
  }
  const workingContent = doc.sanitizedContent;

  let outputContent = "";
  let model = "unknown";
  let citations: { claim: string; evidence: string; grounded: boolean }[] = [];
  let grounding: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
  let outputDlp: "PASS" | "FAIL" = "FAIL";
  let leakageCount = 0;
  const dlpReasons: string[] = [];

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
    grounding = citations.length === 0 ? "SKIPPED" : citations.some((c) => !c.grounded) ? "FAIL" : "PASS";

    const htmlSan = sanitizeOutputHtml(outputContent);
    if (htmlSan.removed.length) {
      outputContent = htmlSan.sanitized;
      dlpReasons.push(...htmlSan.warnings);
    }

    const dlp = runOutputDlp(outputContent, policy);
    outputDlp = dlp.passed ? "PASS" : "FAIL";
    leakageCount = dlp.leakageFindings.length;
    dlpReasons.push(...dlp.reasons);
    if (!dlp.passed) {
      outputContent = dlp.repairedContent;
    }
    const finalSan = sanitizeOutputHtml(outputContent);
    if (finalSan.removed.length) outputContent = finalSan.sanitized;
  } catch (e: unknown) {
    console.error("[transform]", e);
    // Do not leak internal error details to the client.
    return NextResponse.json(
      { error: "Transformation failed — please try again." },
      { status: 502, headers: rateLimitHeaders(rl, 10) }
    );
  }

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
      detail: `Output DLP flagged ${leakageCount} leakage candidate(s); repaired automatically.`,
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
    include: { findings: { orderBy: { createdAt: "asc" } }, transformations: { orderBy: { createdAt: "desc" } }, intelligence: true },
  });

  return NextResponse.json(
    {
      document: updated ? serializeDocument(updated) : null,
      transformation: serializeTransformation(tx),
      dlpReasons,
    },
    { headers: rateLimitHeaders(rl, 10) }
  );
}
