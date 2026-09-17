// Shared full-pipeline run: sanitize → transform → validate → release.

import { db } from "@/lib/db";
import {
  serializeDocument,
  logAudit,
  getPolicyByName,
  serializeTransformation,
} from "@/lib/api/helpers";
import {
  transformContent,
  runOutputDlp,
  scanContent,
  sanitizeContent,
  computeRisk,
  sanitizeOutputHtml,
  overrideKeyForFinding,
} from "@/lib/security";
import type { RawFinding, FindingOverrides } from "@/lib/security";
import type {
  OutputType,
  GenerationTone,
  GenerationLanguage,
  DetailLevel,
  CommunicationObjective,
  ContentStyle,
  SanitizeAction,
  TransformationProfile,
  PolicyRule,
} from "@/types";

export interface PipelineStageEvent {
  event:
    | "sanitize-start"
    | "sanitize-done"
    | "transform-start"
    | "transform-done"
    | "transform-error";
  policy?: string;
  actions?: number;
  residualRisk?: number;
  overridden?: number;
  index?: number;
  total?: number;
  outputType?: OutputType;
  model?: string;
  outputDlp?: string;
  grounding?: string;
  leakageCount?: number;
  error?: string;
}

export interface PipelineRunParams {
  tone?: GenerationTone;
  language?: GenerationLanguage;
  detailLevel?: DetailLevel;
  objective?: CommunicationObjective;
  style?: ContentStyle;
}

export interface PipelineRunOptions {
  documentId: string;
  /** Resolved policy (use getPolicyByName; throws PipelineHttpError when unknown). */
  policyName: string;
  outputTypes: OutputType[];
  params?: PipelineRunParams;
  findingActions?: { id?: string; location?: string; type?: string; action: SanitizeAction }[];
  batchId?: string | null;
  onEvent?: (e: PipelineStageEvent) => void;
}

export interface PipelineRunResult {
  document: ReturnType<typeof serializeDocument> | null;
  transformations: ReturnType<typeof serializeTransformation>[];
  residualRisk: number;
  batchId: string | null;
  errors: { outputType: OutputType; error: string }[];
  dlpReasons: string[];
  blocked: boolean;
  blockReason?: string;
  actions: number;
}

export class PipelineHttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type InputFindingRow = {
  id: string;
  category: string;
  type: string;
  severity: string;
  confidence: number;
  action: string;
  location: string;
  matchedText: string;
  maskedText: string;
  reason: string;
};

/** Resolve + validate a policy name for pipeline use. */
export async function resolvePipelinePolicy(policyName: string): Promise<PolicyRule> {
  const policy = await getPolicyByName(policyName);
  if (!policy) throw new PipelineHttpError(400, "Unknown policy.");
  return policy;
}

export async function runFullPipeline(opts: PipelineRunOptions): Promise<PipelineRunResult> {
  const { documentId: id, outputTypes: requestedTypes, params, batchId } = opts;
  const emit = opts.onEvent ?? (() => {});

  const doc = await db.document.findUnique({
    where: { id },
    include: { findings: { where: { stage: "INPUT" } } },
  });
  if (!doc) throw new PipelineHttpError(404, "Not found.");
  if (doc.status === "BLOCKED") {
    throw new PipelineHttpError(422, "Document is blocked by policy and cannot be transformed.");
  }
  const policy = await resolvePipelinePolicy(opts.policyName);


  emit({ event: "sanitize-start", policy: policy.name });
  const rawFindings: RawFinding[] = doc.findings.map((f) => {
    const m = /char_offset:(\d+)-(\d+)/.exec(f.location || "");
    return {
      category: f.category as RawFinding["category"],
      type: f.type as RawFinding["type"],
      severity: f.severity as RawFinding["severity"],
      confidence: f.confidence,
      defaultAction: f.action as RawFinding["defaultAction"],
      stage: "INPUT" as const,
      start: m ? parseInt(m[1], 10) : 0,
      end: m ? parseInt(m[2], 10) : 0,
      matchedText: f.matchedText,
      maskedText: f.maskedText,
      reason: f.reason,
    };
  });
  if (rawFindings.length === 0) {
    const detected = scanContent(doc.rawContent);
    rawFindings.push(...detected);
    const existingKeys = new Set(doc.findings.map((f) => `${f.location}|${f.type}`));
    const fresh = detected.filter((f) => !existingKeys.has(`char_offset:${f.start}-${f.end}|${f.type}`));
    if (fresh.length > 0) {
      await db.finding.createMany({
        data: fresh.map((f) => ({
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
  }

  // Reviewer overrides (injection/secret invariants enforced).
  const overrides: FindingOverrides = new Map();
  const overrideKeyToId = new Map<string, string>();
  for (const o of opts.findingActions ?? []) {
    const rows = doc.findings as InputFindingRow[];
    let target = o.id ? rows.find((f) => f.id === o.id) : undefined;
    if (!target && o.location && o.type) {
      target = rows.find((f) => f.location === o.location && f.type === o.type);
    }
    if (!target) continue;
    if (target.category === "PROMPT_INJECTION" && o.action === "ALLOW") {
      throw new PipelineHttpError(400, "Prompt-injection findings cannot be set to ALLOW — they must stay quarantined.");
    }
    if (target.category === "SECRET" && o.action === "ALLOW") {
      throw new PipelineHttpError(400, "Credential findings cannot be set to ALLOW — secrets must never pass through to the model.");
    }
    const m = /char_offset:(\d+)-(\d+)/.exec(target.location || "");
    const key = overrideKeyForFinding({
      start: m ? parseInt(m[1], 10) : 0,
      end: m ? parseInt(m[2], 10) : 0,
      type: target.type as RawFinding["type"],
    });
    overrides.set(key, o.action);
    overrideKeyToId.set(key, target.id);
  }

  const san = sanitizeContent(doc.rawContent, rawFindings, policy, overrides.size ? overrides : undefined);
  const residualRisk = computeRisk(scanContent(san.sanitizedContent));

  let docMeta: Record<string, unknown> = {};
  try { docMeta = JSON.parse(doc.metadata ?? "{}"); } catch { docMeta = {}; }
  docMeta.sanitizedPolicy = policy.name;
  docMeta.sanitizedAt = new Date().toISOString();

  await db.document.update({
    where: { id },
    data: {
      sanitizedContent: san.sanitizedContent,
      status: san.blocked ? "BLOCKED" : "SANITIZED",
      riskAfter: san.blocked ? doc.riskBefore : residualRisk.total,
      metadata: JSON.stringify(docMeta),
    },
  });
  if (san.actions.length > 0) {
    await db.$transaction(
      san.actions.map((a) => {
        const overrideId = overrideKeyToId.get(overrideKeyForFinding(a.finding));
        if (overrideId) {
          return db.finding.update({ where: { id: overrideId }, data: { action: a.action, reason: a.reason } });
        }
        const loc = `char_offset:${a.finding.start}-${a.finding.end}`;
        return db.finding.updateMany({
          where: { documentId: id, stage: "INPUT", location: loc },
          data: { action: a.action, reason: a.reason },
        });
      })
    );
  }
  const overrideCount = san.actions.filter((a) => a.overridden).length;
  await logAudit({
    documentId: id,
    actor: "policy_engine",
    action: "POLICY_APPLY",
    detail: san.blocked
      ? `Pipeline: policy "${policy.name}" BLOCKED transformation — no usable prose remains.`
      : `Pipeline: policy "${policy.name}" applied — ${san.actions.length} actions${overrideCount ? ` (${overrideCount} reviewer overrides)` : ""}, residual risk ${residualRisk.total}/100.`,
  });

  if (san.blocked) {
    return {
      document: null,
      transformations: [],
      residualRisk: residualRisk.total,
      batchId: batchId ?? null,
      errors: [],
      dlpReasons: [],
      blocked: true,
      blockReason: san.blockReason,
      actions: san.actions.length,
    };
  }
  emit({ event: "sanitize-done", actions: san.actions.length, residualRisk: residualRisk.total, overridden: overrideCount });


  const workingContent = san.sanitizedContent;
  const transformations: ReturnType<typeof serializeTransformation>[] = [];
  const dlpReasons: string[] = [];
  const itemErrors: { outputType: OutputType; error: string }[] = [];
  const { tone, language, detailLevel, objective, style } = params ?? {};

  let done = 0;
  for (const outType of requestedTypes) {
    done++;
    emit({ event: "transform-start", index: done, total: requestedTypes.length, outputType: outType });
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

        profile: policy.name as TransformationProfile,
        sourceTitle: doc.title,
        tone, language, detailLevel, objective, style,
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
      if (!dlp.passed) outputContent = dlp.repairedContent;
      const finalSan = sanitizeOutputHtml(outputContent);
      if (finalSan.removed.length) outputContent = finalSan.sanitized;
      policyStatus = outputDlp === "PASS" && grounding !== "FAIL" ? "PASS" : "FAIL";
    } catch (e: unknown) {
      console.error("[pipeline]", e);
      const msg = e instanceof Error ? e.message : "Transformation failed";
      itemErrors.push({ outputType: outType, error: msg });
      emit({ event: "transform-error", index: done, total: requestedTypes.length, outputType: outType, error: msg });
      await logAudit({ documentId: id, actor: "llm_adapter", action: "TRANSFORM", detail: `Pipeline: ${outType} via "${policy.name}" failed — ${msg}` });
      continue;
    }

    const outputRisk = computeRisk(scanContent(outputContent));
    const riskDelta = doc.riskBefore - outputRisk.total;
    const created = await db.transformation.create({
      data: {
        documentId: id,
        profile: policy.name,
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
        batchId: batchId ?? null,
      },
    });
    transformations.push(serializeTransformation(created));
    await logAudit({
      documentId: id,
      actor: "llm_adapter",
      action: "TRANSFORM",
      detail: `Pipeline: ${outType} via "${policy.name}" (${model}). Grounding=${grounding}, OutputDLP=${outputDlp}, leakage=${leakageCount}, risk Δ=${riskDelta}.`,
    });
    if (outputDlp === "FAIL") {
      await logAudit({ documentId: id, actor: "output_validator", action: "DLP_BLOCK", detail: `Pipeline: DLP flagged ${leakageCount} leakage candidate(s) for ${outType}; repaired automatically.` });
    } else {
      await logAudit({ documentId: id, actor: "output_validator", action: "RELEASE", detail: `Pipeline: ${outType} passed DLP and grounding checks; released.` });
    }
    emit({ event: "transform-done", index: done, total: requestedTypes.length, outputType: outType, model, outputDlp, grounding, leakageCount });
  }

  if (transformations.length > 0) {
    await db.document.update({ where: { id }, data: { status: "TRANSFORMED" } });
  }
  const updated = await db.document.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } }, transformations: { orderBy: { createdAt: "desc" } }, intelligence: true },
  });

  return {
    document: updated ? serializeDocument(updated) : null,
    transformations,
    residualRisk: residualRisk.total,
    batchId: batchId ?? null,
    errors: itemErrors,
    dlpReasons,
    blocked: false,
    actions: san.actions.length,
  };
}
