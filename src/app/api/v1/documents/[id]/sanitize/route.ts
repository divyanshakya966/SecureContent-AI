import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit, getPolicyByName } from "@/lib/api/helpers";
import { scanContent, sanitizeContent, computeRisk } from "@/lib/security";
import type { RawFinding } from "@/lib/security";
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
  const policyName = (parsed.data.policy as string) || "PUBLIC_RELEASE";

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
  }

  const result = sanitizeContent(doc.rawContent, rawFindings, policy);

  const residualFindings = scanContent(result.sanitizedContent);
  const residualRisk = computeRisk(residualFindings);

  await db.document.update({
    where: { id },
    data: {
      sanitizedContent: result.sanitizedContent,
      status: result.blocked ? "BLOCKED" : "SANITIZED",
      riskAfter: result.blocked ? doc.riskBefore : residualRisk.total,
    },
  });

  // Bulk update finding actions in a transaction to avoid N+1 and partial state.
  if (result.actions.length > 0) {
    await db.$transaction(
      result.actions.map((a) => {
        const loc = `char_offset:${a.finding.start}-${a.finding.end}`;
        return db.finding.updateMany({
          where: { documentId: id, location: loc },
          data: { action: a.action, reason: a.reason },
        });
      })
    );
  }

  await logAudit({
    documentId: id,
    actor: "policy_engine",
    action: "POLICY_APPLY",
    detail: result.blocked
      ? `Policy "${policy.name}" BLOCKED transformation: ${result.actions.length} findings evaluated, no usable prose remains.`
      : `Policy "${policy.name}" applied: ${result.actions.length} actions, residual risk ${residualRisk.total}/100.`,
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
