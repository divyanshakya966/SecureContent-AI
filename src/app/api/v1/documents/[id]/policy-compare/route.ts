import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPolicyByName } from "@/lib/api/helpers";
import { scanContent, sanitizeContent, computeRisk } from "@/lib/security";
import { PolicyCompareSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey } from "@/lib/validation/rateLimit";
import type { PolicyCompareResult, PolicyCompareItem } from "@/types";

export const runtime = "nodejs";

// POST /api/v1/documents/:id/policy-compare
// Body: { profiles: ["PUBLIC_RELEASE", "INTERNAL_SUMMARY", ...], outputType: "EXECUTIVE_SUMMARY" }
// Returns sanitized previews for each audience/policy — demonstrates Policy-Aware Transformation.

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = checkRateLimit(rateLimitKey(req, `POST /policy-compare:${id}`), { max: 15, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const doc = await db.document.findUnique({ where: { id }, include: { findings: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const parsed = parseOr400(PolicyCompareSchema as any, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { profiles, outputType } = parsed.data as any;

  // Reconstruct RawFindings from stored locations
  const rawFindings = ((doc.findings ?? []) as any[])
    .filter((f: any) => f.stage === "INPUT")
    .map((f: any) => {
      const m = /char_offset:(\d+)-(\d+)/.exec(f.location || "");
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m ? parseInt(m[2], 10) : start;
      return {
        category: f.category as any,
        type: f.type as any,
        severity: f.severity as any,
        confidence: f.confidence,
        defaultAction: f.action as any,
        stage: "INPUT" as const,
        start,
        end,
        matchedText: f.matchedText,
        maskedText: f.maskedText,
        reason: f.reason,
      };
    });

  const initialRisk = computeRisk(rawFindings).total;

  const items: PolicyCompareItem[] = [];

  for (const profile of profiles as string[]) {
    const policy = await getPolicyByName(profile);
    if (!policy) continue;

    const sanitized = sanitizeContent(doc.rawContent, rawFindings, policy as any);
    const residual = scanContent(sanitized.sanitizedContent);
    const residualRisk = computeRisk(residual).total;

    // Find latest transformation for this profile if any
    const tx = await db.transformation.findFirst({
      where: { documentId: id, profile },
      orderBy: { createdAt: "desc" },
    });

    items.push({
      profile: profile as any,
      audience: (policy as any).audience ?? policy.classification ?? profile,
      sanitizedPreview: sanitized.sanitizedContent.slice(0, 400),
      sanitizedContent: sanitized.sanitizedContent,
      findingsRedacted: sanitized.actions.length,
      riskBefore: initialRisk,
      riskAfter: sanitized.blocked ? initialRisk : residualRisk,
      blocked: sanitized.blocked,
      blockReason: sanitized.blockReason,
      transformation: tx ? {
        id: tx.id,
        documentId: tx.documentId,
        profile: tx.profile as any,
        outputType: tx.outputType as any,
        model: tx.model,
        outputContent: tx.outputContent,
        grounding: tx.grounding as any,
        policyStatus: tx.policyStatus as any,
        outputDlp: tx.outputDlp as any,
        riskDelta: tx.riskDelta,
        leakageCount: tx.leakageCount,
        citations: (() => { try { return JSON.parse(tx.citations); } catch { return []; } })(),
        createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
      } : undefined,
    });
  }

  const result: PolicyCompareResult = {
    documentId: id,
    outputType: outputType as any,
    items,
    generatedAt: new Date().toISOString(),
  };

  // Audit log for policy compare (T3)
  await db.auditLog.create({
    data: {
      documentId: id,
      actor: "policy_engine",
      action: "POLICY_COMPARE",
      detail: `Compared ${items.length} policies for ${outputType} — ${profiles.join(", ")}`,
    },
  }).catch(() => {});

  return NextResponse.json(result);
}
