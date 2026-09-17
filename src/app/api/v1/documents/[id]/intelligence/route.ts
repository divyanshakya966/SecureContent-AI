import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureIntelligence } from "@/lib/intelligence/service";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { requireApiAuth } from "@/lib/auth";
import { DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `GET /intelligence:${id}`), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 60) });

  const report = await ensureIntelligence(id);
  if (!report) return NextResponse.json({ error: "Failed to generate intelligence" }, { status: 500, headers: rateLimitHeaders(rl, 60) });

  return NextResponse.json({ intelligence: report }, { headers: rateLimitHeaders(rl, 60) });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _auth = requireApiAuth(req);
  if (_auth) return _auth;
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `POST /intelligence:${id}`), { max: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 10) });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 10) });

  const report = await ensureIntelligence(id, { force: true });
  if (!report) return NextResponse.json({ error: "Failed to generate intelligence" }, { status: 500, headers: rateLimitHeaders(rl, 10) });

  return NextResponse.json({ intelligence: report }, { headers: rateLimitHeaders(rl, 10) });
}
