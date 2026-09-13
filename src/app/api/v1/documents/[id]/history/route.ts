import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeTransformation, serializeAudit } from "@/lib/api/helpers";
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

  const rl = checkRateLimit(rateLimitKey(req, `GET /history:${id}`), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 60) });

  const [transformations, audit] = await Promise.all([
    db.transformation.findMany({
      where: { documentId: id },
      orderBy: { createdAt: "desc" },
    }),
    db.auditLog.findMany({
      where: { documentId: id },
      orderBy: { timestamp: "desc" },
      take: 50,
    }),
  ]);
  return NextResponse.json(
    {
      transformations: transformations.map(serializeTransformation),
      audit: audit.map(serializeAudit),
    },
    { headers: rateLimitHeaders(rl, 60) }
  );
}
