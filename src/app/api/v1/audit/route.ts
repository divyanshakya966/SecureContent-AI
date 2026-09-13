import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeAudit } from "@/lib/api/helpers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(req, "GET /api/v1/audit"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }

  const takeParam = req.nextUrl.searchParams.get("take");
  const take = takeParam ? Math.min(200, Math.max(1, parseInt(takeParam, 10) || 100)) : 100;

  const audit = await db.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take,
    include: { document: { select: { title: true, filename: true } } },
  });
  return NextResponse.json({ audit: audit.map(serializeAudit) }, { headers: rateLimitHeaders(rl, 60) });
}
