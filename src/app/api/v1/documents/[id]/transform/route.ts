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
import { requireApiAuth } from "@/lib/auth";
import type { OutputType, TransformationProfile, GenerationTone, GenerationLanguage, DetailLevel, CommunicationObjective, ContentStyle } from "@/types";

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

  const rl = checkRateLimit(rateLimitKey(req, `POST /transform:${id}`), { max: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 10) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(TransformSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 10) });
  const {
    profile,
    outputType,
    outputTypes,
    tone,
    language,
    detailLevel,
    objective,
    style,
    batchId: requestedBatchId,
  } = parsed.data as {
    profile: TransformationProfile;
    outputType: OutputType;
    outputTypes?: OutputType[];
    tone?: GenerationTone;
    language?: GenerationLanguage;
    detailLevel?: DetailLevel;
    objective?: CommunicationObjective;
    style?: ContentStyle;
    batchId?: string;
  };

  const requestedTypes: OutputType[] = outputTypes && outputTypes.length ? outputTypes : [outputType];
  if (requestedTypes.length > 8) {
    return NextResponse.json({ error: "Too many output types (max 8)" }, { status: 400, headers: rateLimitHeaders(rl, 10) });
  }
  const batchId = requestedTypes.length > 1 ? (requestedBatchId ?? crypto.randomUUID()) : (requestedBatchId ?? null);

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

  // Re-sanitize when the stored copy came from a different profile.
  let storedPolicy: string | null = null;
  try {
    storedPolicy = (JSON.parse(doc.metadata ?? "{}") as { sanitizedPolicy?: string }).sanitizedPolicy ?? null;
  } catch {
    storedPolicy = null;
  }
  let workingContent = doc.sanitizedContent;
  if (!workingContent || storedPolicy !== profile) {
    const findingsFromDb = await db.finding.findMany({ where: { documentId: id, stage: "INPUT" } });

    const fallbackFindings = findingsFromDb.length ? null : (await import("@/lib/security")).scanContent(doc.rawContent);
    const rawFindingsForSanitize = findingsFromDb.length
      ? findingsFromDb.map((f) => {
          const m = /char_offset:(\d+)-(\d+)/.exec(f.location || "");
          return {
            category: f.category as import("@/lib/security").RawFinding["category"],
            type: f.type as import("@/lib/security").RawFinding["type"],
            severity: f.severity as import("@/lib/security").RawFinding["severity"],
            confidence: f.confidence,
            defaultAction: f.action as import("@/lib/security").RawFinding["defaultAction"],
            stage: "INPUT" as const,
            start: m ? parseInt(m[1], 10) : 0,
            end: m ? parseInt(m[2], 10) : 0,
            matchedText: f.matchedText,
            maskedText: f.maskedText,
            reason: f.reason,
          };
        })
      : (fallbackFindings as import("@/lib/security").RawFinding[]);

    const { sanitizeContent: sanitizeFn, computeRisk: riskFn } = await import("@/lib/security");
    const san = sanitizeFn(doc.rawContent, rawFindingsForSanitize, policy);
    if (san.blocked) {
      return NextResponse.json(
        { error: san.blockReason ?? "Document is blocked by policy and cannot be transformed." },
        { status: 422, headers: rateLimitHeaders(rl, 10) }
      );
    }
    const residualFindings = (await import("@/lib/security")).scanContent(san.sanitizedContent);
    const residualRisk = riskFn(residualFindings);
    let transformMeta: Record<string, unknown> = {};
    try {
      transformMeta = JSON.parse(doc.metadata ?? "{}");
    } catch {
      transformMeta = {};
    }
    transformMeta.sanitizedPolicy = policy.name;
    transformMeta.sanitizedAt = new Date().toISOString();
    await db.document.update({
      where: { id },
      data: {
        sanitizedContent: san.sanitizedContent,
        status: "SANITIZED",
        riskAfter: residualRisk.total,
        metadata: JSON.stringify(transformMeta),
      },
    });

    if (san.actions.length) {
      await db.$transaction(
        san.actions.map((a) => {
          const loc = `char_offset:${a.finding.start}-${a.finding.end}`;
          return db.finding.updateMany({ where: { documentId: id, stage: "INPUT", location: loc }, data: { action: a.action, reason: a.reason } });
        })
      ).catch(() => {});
    }
    await logAudit({
      documentId: id,
      actor: "policy_engine",
      action: "POLICY_APPLY",
      detail: storedPolicy && storedPolicy !== policy.name
        ? `Re-sanitized on transform (working copy was "${storedPolicy}", requested "${policy.name}") — ${san.actions.length} actions, residual risk ${residualRisk.total}/100.`
        : `Auto-sanitized on transform via "${policy.name}" — ${san.actions.length} actions, residual risk ${residualRisk.total}/100.`,
    });
    workingContent = san.sanitizedContent;
  }

  const transformations: ReturnType<typeof serializeTransformation>[] = [];
  const dlpReasons: string[] = [];
  const itemErrors: { outputType: OutputType; error: string }[] = [];
  const createdIds: string[] = [];

  for (const outType of requestedTypes) {
    let outputContent = "";
    let model = "unknown";
    let citations: { claim: string; evidence: string; grounded: boolean }[] = [];
    let grounding: "PASS" | "FAIL" | "SKIPPED" = "SKIPPED";
    let outputDlp: "PASS" | "FAIL" = "FAIL";
    let policyStatus: "PASS" | "FAIL" = "FAIL";
    let leakageCount = 0;

    try {
      const tx = await transformContent({
        sanitizedContent: workingContent,
        outputType: outType,
        profile,
        sourceTitle: doc.title,
        tone,
        language,
        detailLevel,
        objective,
        style,
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
      // policyStatus mirrors validation, even though the repaired copy ships.
      policyStatus = outputDlp === "PASS" && grounding !== "FAIL" ? "PASS" : "FAIL";
    } catch (e: unknown) {
      console.error("[transform]", e);
      const msg = e instanceof Error ? e.message : "Transformation failed";
      const isConfigError = msg.includes("sanitizedContent is empty") || msg.includes("Transformation unavailable") || msg.includes("GEMINI_API_KEY") || msg.includes("ALLOW_OFFLINE_MOCK");
      // Record the failure and continue with remaining types.
      itemErrors.push({ outputType: outType, error: isConfigError ? msg : `Transformation failed for ${outType} — please try again.` });
      await logAudit({
        documentId: id,
        actor: "llm_adapter",
        action: "TRANSFORM",
        detail: `Failed ${outType} via "${profile}": ${msg}`,
      });
      continue;
    }

    const outputFindings = scanContent(outputContent);
    const outputRisk = computeRisk(outputFindings);
    const riskDelta = doc.riskBefore - outputRisk.total;

    const created = await db.transformation.create({
      data: {
        documentId: id,
        profile,
        outputType: outType,
        model,
        outputContent,
        grounding,
        policyStatus,
        outputDlp,
        riskDelta,
        leakageCount,
        citations: JSON.stringify(citations),
        tone: tone ?? null,
        language: language ?? null,
        detailLevel: detailLevel ?? null,
        objective: objective ?? null,
        style: style ?? null,
        batchId,
      },
    });
    createdIds.push(created.id);
    transformations.push(serializeTransformation(created));

    await logAudit({
      documentId: id,
      actor: "llm_adapter",
      action: "TRANSFORM",
      detail: `Transformed via "${profile}" → ${outType} (${model}) [tone=${tone ?? "default"}, lang=${language ?? "en"}, detail=${detailLevel ?? "std"}, obj=${objective ?? "inform"}, style=${style ?? "structured"}]. Grounding=${grounding}, OutputDLP=${outputDlp}, leakage=${leakageCount}, risk Δ=${riskDelta}.`,
    });

    if (outputDlp === "FAIL") {
      await logAudit({
        documentId: id,
        actor: "output_validator",
        action: "DLP_BLOCK",
        detail: `Output DLP flagged ${leakageCount} leakage candidate(s) for ${outType}; repaired automatically.`,
      });
    } else {
      await logAudit({
        documentId: id,
        actor: "output_validator",
        action: "RELEASE",
        detail: `Output ${outType} passed DLP and grounding checks; released.`,
      });
    }
  }

  // All-failed surfaces an error; otherwise release the partial batch.
  if (transformations.length === 0) {
    const first = itemErrors[0];
    const msg = first?.error ?? "Transformation failed — please try again.";
    const isConfigError = msg.includes("sanitizedContent is empty") || msg.includes("Transformation unavailable") || msg.includes("GEMINI_API_KEY") || msg.includes("ALLOW_OFFLINE_MOCK");
    return NextResponse.json(
      { error: requestedTypes.length > 1 ? `All ${requestedTypes.length} transformations failed. ${msg}` : msg, errors: itemErrors },
      { status: isConfigError ? 503 : 502, headers: rateLimitHeaders(rl, 10) }
    );
  }

  await db.document.update({
    where: { id },
    data: { status: "TRANSFORMED" },
  });

  const updated = await db.document.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } }, transformations: { orderBy: { createdAt: "desc" } }, intelligence: true },
  });


  const isSingle = requestedTypes.length === 1;
  return NextResponse.json(
    {
      document: updated ? serializeDocument(updated) : null,
      transformation: isSingle ? transformations[0] : undefined,
      transformations,
      dlpReasons,
      batchId,
      ...(itemErrors.length ? { errors: itemErrors } : {}),
    },
    { headers: rateLimitHeaders(rl, 10) }
  );
}
