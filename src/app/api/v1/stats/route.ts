import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeAudit, ensureDefaultPolicies } from "@/lib/api/helpers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import type { DashboardStats } from "@/types";

export const runtime = "nodejs";

const CATEGORY_COLOR: Record<string, string> = {
  PII: "oklch(0.6 0.13 162)",
  SECRET: "oklch(0.62 0.21 27)",
  PROMPT_INJECTION: "oklch(0.62 0.18 305)",
  INTERNAL_ASSET: "oklch(0.7 0.16 70)",
  UNSAFE_URL: "oklch(0.55 0.05 250)",
};

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(req, "GET /api/v1/stats"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }

  await ensureDefaultPolicies();

  const [
    totalDocuments,
    scannedDocuments,
    sanitizedDocuments,
    transformedDocuments,
    blockedDocuments,
    highRiskDocuments,
    findingsAgg,
    auditRecent,
    docsForTrend,
    classAgg,
    intelReports,
    intelAgg,
  ] = await Promise.all([
    db.document.count(),
    db.document.count({ where: { status: "SCANNED" } }),
    db.document.count({ where: { status: "SANITIZED" } }),
    db.document.count({ where: { status: "TRANSFORMED" } }),
    db.document.count({ where: { status: "BLOCKED" } }),
    db.document.count({ where: { riskScore: { gte: 50 } } }),
    db.finding.groupBy({
      by: ["category"],
      _count: true,
      where: { stage: "INPUT" },
    }),
    db.auditLog.findMany({ orderBy: { timestamp: "desc" }, take: 12 }),
    db.document.findMany({
      orderBy: { createdAt: "desc" },
      take: 14,
      select: { title: true, riskBefore: true, riskAfter: true, createdAt: true },
    }),
    db.document.groupBy({ by: ["classification"], _count: true }),
    db.intelligenceReport.findMany({ select: { entities: true, iocs: true, ttps: true } }),
    db.intelligenceReport.count(),
  ]);

  const totalFindings = findingsAgg.reduce((a, b) => a + b._count, 0);
  const secretsBlocked = findingsAgg.find((f) => f.category === "SECRET")?._count ?? 0;
  const piiDetected = findingsAgg.find((f) => f.category === "PII")?._count ?? 0;
  const injectionBlocked = findingsAgg.find((f) => f.category === "PROMPT_INJECTION")?._count ?? 0;

  const releasedTransformations = await db.transformation.count({ where: { outputDlp: "PASS" } });

  const reducedDocs = await db.document.findMany({
    where: { riskAfter: { gt: 0 } },
    select: { riskBefore: true, riskAfter: true },
  });
  const avgRiskReduction = reducedDocs.length
    ? Math.round(
        reducedDocs.reduce((acc, d) => acc + (d.riskBefore - d.riskAfter), 0) /
          reducedDocs.length
      )
    : 0;

  const findingsByCategory = findingsAgg.map((f) => ({
    category: f.category,
    count: f._count,
    color: CATEGORY_COLOR[f.category] ?? "oklch(0.5 0 0)",
  }));

  const documentsByClassification = classAgg.map((c) => ({
    classification: c.classification,
    count: c._count,
  }));

  const riskTrend = docsForTrend
    .slice()
    .reverse()
    .map((d, i) => ({
      label: `D${i + 1}`,
      title: d.title,
      before: d.riskBefore,
      after: d.riskAfter,
    }));

  let totalEntities = 0;
  let totalIOCs = 0;
  let totalTTPs = 0;
  for (const r of intelReports) {
    try {
      const parsed = JSON.parse(r.entities as string);
      if (Array.isArray(parsed)) totalEntities += parsed.length;
    } catch {}
    try {
      const parsed = JSON.parse(r.iocs as string);
      if (Array.isArray(parsed)) totalIOCs += parsed.length;
    } catch {}
    try {
      const parsed = JSON.parse(r.ttps as string);
      if (Array.isArray(parsed)) totalTTPs += parsed.length;
    } catch {}
  }

  const stats: DashboardStats = {
    totalDocuments,
    scannedDocuments,
    sanitizedDocuments,
    transformedDocuments,
    blockedDocuments,
    highRiskDocuments,
    totalFindings,
    secretsBlocked,
    piiDetected,
    injectionBlocked,
    safeOutputsReleased: releasedTransformations,
    avgRiskReduction,
    findingsByCategory,
    documentsByClassification,
    riskTrend,
    recentActivity: auditRecent.map(serializeAudit),
    totalIntelligenceReports: intelAgg,
    totalEntities,
    totalIOCs,
    totalTTPs,
  };

  return NextResponse.json({ stats }, { headers: rateLimitHeaders(rl, 60) });
}
