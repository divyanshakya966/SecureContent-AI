import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { SecurityReport, Severity } from "@/types";
import { computeRisk } from "@/lib/security";
import type { RawFinding } from "@/lib/security";
import { DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `GET /security-report:${id}`), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });

  const doc = await db.document.findUnique({
    where: { id },
    include: {
      findings: { orderBy: { createdAt: "asc" } },
      transformations: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 60) });

  const inputFindings = doc.findings.filter((f) => f.stage === "INPUT");
  const outputFindings = doc.findings.filter((f) => f.stage === "OUTPUT");
  const rawForRisk: RawFinding[] = inputFindings.map((f) => {
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
  const risk = computeRisk(rawForRisk);

  const severityBreakdown: Record<Severity, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const f of inputFindings) severityBreakdown[f.severity as Severity]++;

  const latest = doc.transformations[0];
  // Preview the working copy sent to the model — never fall back to raw
  // content, which may contain unredacted secrets.
  const sanitized = doc.sanitizedContent;
  const preview = !sanitized
    ? "Awaiting sanitization — run Sanitize to generate the working copy preview."
    : sanitized.length > 600 ? sanitized.slice(0, 600) + "…" : sanitized;

  const report: SecurityReport = {
    documentId: doc.id,
    riskScore: doc.riskScore,
    riskBefore: doc.riskBefore,
    riskAfter: doc.riskAfter,
    classification: doc.classification as SecurityReport["classification"],
    findings: {
      pii: inputFindings.filter((f) => f.category === "PII").length,
      secrets: inputFindings.filter((f) => f.category === "SECRET").length,
      promptInjection: inputFindings.filter((f) => f.category === "PROMPT_INJECTION").length,
      internalAssets: inputFindings.filter((f) => f.category === "INTERNAL_ASSET").length,
      unsafeUrls: inputFindings.filter((f) => f.category === "UNSAFE_URL").length,
      outputLeakage: outputFindings.length + (latest?.leakageCount ?? 0),
    },
    severityBreakdown,
    grounding: (latest?.grounding ?? "SKIPPED") as SecurityReport["grounding"],
    policyStatus: (latest?.policyStatus ?? "SKIPPED") as SecurityReport["policyStatus"],
    outputDlp: (latest?.outputDlp ?? "SKIPPED") as SecurityReport["outputDlp"],
    topFindings: inputFindings
      .slice()
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
      .map((f) => ({
        id: f.id,
        documentId: doc.id,
        category: f.category as SecurityReport["topFindings"][number]["category"],
        type: f.type as SecurityReport["topFindings"][number]["type"],
        severity: f.severity as SecurityReport["topFindings"][number]["severity"],
        confidence: f.confidence,
        action: f.action as SecurityReport["topFindings"][number]["action"],
        stage: f.stage as SecurityReport["topFindings"][number]["stage"],
        location: f.location,
        // Withhold raw secret material from the report payload — the masked
        // form plus reason is sufficient for reviewers; full spans live in
        // the findings inventory.
        matchedText: f.category === "SECRET" ? "[withheld]" : f.matchedText.slice(0, 48),
        maskedText: f.maskedText,
        reason: f.reason,
        createdAt: f.createdAt instanceof Date ? f.createdAt.toISOString() : String(f.createdAt),
      })),
    sanitizedPreview: preview,
    generatedAt: new Date().toISOString(),
  };

  return NextResponse.json({ report, riskBreakdown: risk }, { headers: rateLimitHeaders(rl, 60) });
}
