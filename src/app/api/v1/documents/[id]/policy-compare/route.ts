import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPolicyByName } from "@/lib/api/helpers";
import { scanContent, sanitizeContent, computeRisk } from "@/lib/security";
import type { RawFinding } from "@/lib/security";
import { PolicyCompareSchema, DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import type { PolicyCompareResult, PolicyCompareItem } from "@/types";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `POST /policy-compare:${id}`), { max: 15, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 15) });

  const doc = await db.document.findUnique({ where: { id }, include: { findings: true } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 15) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(PolicyCompareSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 15) });

  const { profiles, outputType } = parsed.data;

  const rawFindings: RawFinding[] = (doc.findings ?? [])
    .filter((f) => f.stage === "INPUT")
    .map((f) => {
      const m = /char_offset:(\d+)-(\d+)/.exec(f.location || "");
      const start = m ? parseInt(m[1], 10) : 0;
      const end = m ? parseInt(m[2], 10) : start;
      return {
        category: f.category as RawFinding["category"],
        type: f.type as RawFinding["type"],
        severity: f.severity as RawFinding["severity"],
        confidence: f.confidence,
        defaultAction: f.action as RawFinding["defaultAction"],
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

  for (const profile of profiles) {
    const policy = await getPolicyByName(profile);
    if (!policy) continue;

    const sanitized = sanitizeContent(doc.rawContent, rawFindings, policy);
    const residual = scanContent(sanitized.sanitizedContent);
    const residualRisk = computeRisk(residual).total;

    const tx = await db.transformation.findFirst({
      where: { documentId: id, profile },
      orderBy: { createdAt: "desc" },
    });

    items.push({
      profile: profile as PolicyCompareItem["profile"],
      audience: (policy as unknown as { audience?: string }).audience ?? policy.classification ?? profile,
      sanitizedPreview: sanitized.sanitizedContent.slice(0, 400),
      sanitizedContent: sanitized.sanitizedContent,
      findingsRedacted: sanitized.actions.length,
      riskBefore: initialRisk,
      riskAfter: sanitized.blocked ? initialRisk : residualRisk,
      blocked: sanitized.blocked,
      blockReason: sanitized.blockReason,
      transformation: tx
        ? {
            id: tx.id,
            documentId: tx.documentId,
            profile: tx.profile as PolicyCompareItem["profile"],
            outputType: tx.outputType as PolicyCompareItem extends { transformation?: infer T } ? T extends { outputType: infer O } ? O : never : never,
            model: tx.model,
            outputContent: tx.outputContent,
            grounding: tx.grounding as unknown as PolicyCompareItem["transformation"] extends { grounding: infer G } ? G : never,
            policyStatus: tx.policyStatus as unknown as PolicyCompareItem["transformation"] extends { policyStatus: infer P } ? P : never,
            outputDlp: tx.outputDlp as unknown as PolicyCompareItem["transformation"] extends { outputDlp: infer D } ? D : never,
            riskDelta: tx.riskDelta,
            leakageCount: tx.leakageCount,
            citations: (() => {
              try {
                return JSON.parse(tx.citations);
              } catch {
                return [];
              }
            })(),
            createdAt: tx.createdAt instanceof Date ? tx.createdAt.toISOString() : String(tx.createdAt),
          }
        : undefined,
    });
  }

  const result: PolicyCompareResult = {
    documentId: id,
    outputType: outputType as PolicyCompareResult["outputType"],
    items,
    generatedAt: new Date().toISOString(),
  };

  await db.auditLog
    .create({
      data: {
        documentId: id,
        actor: "policy_engine",
        action: "POLICY_COMPARE",
        detail: `Compared ${items.length} policies for ${outputType} — ${profiles.join(", ")}`,
      },
    })
    .catch(() => {});

  return NextResponse.json(result, { headers: rateLimitHeaders(rl, 15) });
}
