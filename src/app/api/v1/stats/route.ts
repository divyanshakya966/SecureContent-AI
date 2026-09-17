import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeAudit, ensureDefaultPolicies } from "@/lib/api/helpers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import type { DashboardStats } from "@/types";

export const runtime = "nodejs";

const CATEGORY_COLOR: Record<string, string> = {
  PII: "var(--chart-1)",
  SECRET: "var(--chart-3)",
  PROMPT_INJECTION: "var(--chart-5)",
  INTERNAL_ASSET: "var(--chart-2)",
  UNSAFE_URL: "var(--chart-4)",
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
      select: { title: true, riskBefore: true, riskAfter: true, createdAt: true, status: true },
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

  // Include fully-cleaned docs; a `gt: 0` filter would drop the best results.
  const reducedDocs = await db.document.findMany({
    where: { status: { in: ["SANITIZED", "TRANSFORMED"] } },
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

  // Pre-sanitize docs show after = before (riskAfter is still a placeholder).
  const riskTrend = docsForTrend
    .slice()
    .reverse()
    .map((d, i) => {
      const done = d.status === "SANITIZED" || d.status === "TRANSFORMED" || d.status === "BLOCKED";
      return {
        label: `D${i + 1}`,
        title: d.title,
        before: d.riskBefore,
        after: done ? d.riskAfter : d.riskBefore,
      };
    });

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
