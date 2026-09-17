import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeAudit } from "@/lib/api/helpers";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { AuditQuerySchema, parseOr400 } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(req, "GET /api/v1/audit"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }

  const parsed = parseOr400(AuditQuerySchema, { take: req.nextUrl.searchParams.get("take") ?? undefined });
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 60) });
  }
  const take = parsed.data.take;

  const audit = await db.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take,
    include: { document: { select: { title: true, filename: true } } },
  });
  return NextResponse.json({ audit: audit.map(serializeAudit) }, { headers: rateLimitHeaders(rl, 60) });
}
