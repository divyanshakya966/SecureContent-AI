import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit, getPolicyByName } from "@/lib/api/helpers";
import { scanContent, sanitizeContent, computeRisk, overrideKeyForFinding } from "@/lib/security";
import type { RawFinding, FindingOverrides } from "@/lib/security";
import type { SanitizeAction } from "@/types";
import { SanitizeSchema, DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `POST /sanitize:${id}`), { max: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 20) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(SanitizeSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 20) });
  // Accept `profile` as an alias for `policy` (same vocabulary) — but never
  // silently fall back: an explicit unknown value is a 400 via the schema.
  const rawBody = body as { policy?: string; profile?: string };
  const policyName = rawBody.policy ?? rawBody.profile ?? (parsed.data.policy as string) ?? "PUBLIC_RELEASE";
  const requestedOverrides = (parsed.data.findingActions ?? []) as { id?: string; location?: string; type?: string; action: SanitizeAction }[];

  const doc = await db.document.findUnique({
    where: { id },
    include: { findings: { where: { stage: "INPUT" } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 20) });

  const policy = await getPolicyByName(policyName);
  if (!policy) return NextResponse.json({ error: "Unknown policy." }, { status: 400, headers: rateLimitHeaders(rl, 20) });

  const rawFindings: RawFinding[] = doc.findings.map((f) => {
    const m = /char_offset:(\d+)-(\d+)/.exec(f.location || "");
    const start = m ? parseInt(m[1], 10) : 0;
    const end = m ? parseInt(m[2], 10) : start;
    return {
      category: f.category as RawFinding["category"],
      type: f.type as RawFinding["type"],
      severity: f.severity as RawFinding["severity"],
      confidence: f.confidence,
      defaultAction: f.action as RawFinding["defaultAction"],
      stage: "INPUT",
      start,
      end,
      matchedText: f.matchedText,
      maskedText: f.maskedText,
      reason: f.reason,
    };
  });

  if (rawFindings.length === 0) {
    const detected = scanContent(doc.rawContent);
    rawFindings.push(...detected);
    // Persist live-scanned findings so the findings inventory stays complete.
    if (detected.length > 0) {
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
  }

  // Reviewer per-finding overrides: resolve each request to a concrete INPUT
  // finding of this document, enforcing the platform invariants up front
  // (injections: quarantine/redact only; secrets: never ALLOW).
  const overrides: FindingOverrides = new Map();
  const overrideKeyToId = new Map<string, string>();
  for (const o of requestedOverrides) {
    let target = o.id ? doc.findings.find((f) => f.id === o.id) : undefined;
    if (!target && o.location && o.type) {
      target = doc.findings.find((f) => f.location === o.location && f.type === o.type);
    }
    if (!target) continue; // unknown/stale reference — ignore, don't fail the batch
    if (target.category === "PROMPT_INJECTION" && o.action === "ALLOW") {
      return NextResponse.json({ error: "Prompt-injection findings cannot be set to ALLOW — they must stay quarantined." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
    }
    if (target.category === "SECRET" && o.action === "ALLOW") {
      return NextResponse.json({ error: "Credential findings cannot be set to ALLOW — secrets must never pass through to the model." }, { status: 400, headers: rateLimitHeaders(rl, 20) });
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

  const result = sanitizeContent(doc.rawContent, rawFindings, policy, overrides.size ? overrides : undefined);

  const residualFindings = scanContent(result.sanitizedContent);
  const residualRisk = computeRisk(residualFindings);

  // Record which policy produced the working copy so later steps can detect
  // a stale copy (sanitized under a different profile) and re-sanitize.
  let metadata: Record<string, unknown> = {};
  try {
    metadata = JSON.parse(doc.metadata ?? "{}");
  } catch {
    metadata = {};
  }
  metadata.sanitizedPolicy = policy.name;
  metadata.sanitizedAt = new Date().toISOString();

  await db.document.update({
    where: { id },
    data: {
      sanitizedContent: result.sanitizedContent,
      status: result.blocked ? "BLOCKED" : "SANITIZED",
      riskAfter: result.blocked ? doc.riskBefore : residualRisk.total,
      metadata: JSON.stringify(metadata),
    },
  });

  // Bulk update finding actions in a transaction to avoid N+1 and partial state.
  // Stage-scoped so INPUT actions never clobber OUTPUT-stage records at the
  // same offsets. Reviewer-overridden findings update by id (exact).
  if (result.actions.length > 0) {
    await db.$transaction(
      result.actions.map((a) => {
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

  const overrideCount = result.actions.filter((a) => a.overridden).length;

  await logAudit({
    documentId: id,
    actor: "policy_engine",
    action: "POLICY_APPLY",
    detail: result.blocked
      ? `Policy "${policy.name}" BLOCKED transformation: ${result.actions.length} findings evaluated, no usable prose remains.`
      : `Policy "${policy.name}" applied: ${result.actions.length} actions${overrideCount ? ` (${overrideCount} reviewer overrides)` : ""}, residual risk ${residualRisk.total}/100.`,
  });

  const updated = await db.document.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } }, intelligence: true, transformations: true },
  });
  return NextResponse.json(
    {
      document: updated ? serializeDocument(updated) : null,
      actions: result.actions,
      blocked: result.blocked,
      blockReason: result.blockReason,
      residualRisk: residualRisk.total,
    },
    { headers: rateLimitHeaders(rl, 20) }
  );
}
