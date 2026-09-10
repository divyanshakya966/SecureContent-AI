import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit, getPolicyByName } from "@/lib/api/helpers";
import { scanContent, sanitizeContent, computeRisk } from "@/lib/security";
import type { RawFinding } from "@/lib/security";
import { SanitizeSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

// Apply a transformation policy: produce a sanitized working copy.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = checkRateLimit(rateLimitKey(req, `POST /sanitize:${id}`), { max: 20, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const body = await req.json().catch(() => ({} as any));
  const parsed = parseOr400(SanitizeSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const policyName = (parsed.data as any).policy || (parsed.data as any).profile || "PUBLIC_RELEASE";

  const doc = await db.document.findUnique({
    where: { id },
    include: { findings: { where: { stage: "INPUT" } } },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const policy = await getPolicyByName(policyName);
  if (!policy) return NextResponse.json({ error: "Unknown policy." }, { status: 400 });

  // Reconstruct RawFinding offsets from the stored location strings.
  const rawFindings: RawFinding[] = doc.findings.map((f) => {
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
      start,
      end,
      matchedText: f.matchedText,
      maskedText: f.maskedText,
      reason: f.reason,
    };
  });

  // If no findings yet, re-scan.
  if (rawFindings.length === 0) {
    const detected = scanContent(doc.rawContent);
    rawFindings.push(...detected);
  }

  const result = sanitizeContent(doc.rawContent, rawFindings, policy);

  // Compute the post-sanitization residual risk by scanning the sanitized text.
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

  // Update stored finding actions to reflect the policy decision.
  for (const a of result.actions) {
    const m = result.actions.find(
      (x) => x.finding.start === a.finding.start && x.action === a.action
    );
    if (!m) continue;
    const loc = `char_offset:${a.finding.start}-${a.finding.end}`;
    await db.finding.updateMany({
      where: { documentId: id, location: loc },
      data: { action: a.action, reason: a.reason },
    });
  }

  await logAudit({
    documentId: id,
    actor: "policy_engine",
    action: "POLICY_APPLY",
    detail: result.blocked
      ? `Policy "${policy.name}" BLOCKED transformation: ${result.actions.length} block-level findings.`
      : `Policy "${policy.name}" applied: ${result.actions.length} actions, residual risk ${residualRisk.total}/100.`,
  });

  const updated = await db.document.findUnique({
    where: { id },
    include: { findings: { orderBy: { createdAt: "asc" } }, intelligence: true, transformations: true },
  });
  return NextResponse.json({
    document: serializeDocument(updated),
    actions: result.actions,
    blocked: result.blocked,
    residualRisk: residualRisk.total,
  });
}
