import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeIntelligence } from "@/lib/api/helpers";
import { ensureIntelligence } from "@/lib/intelligence/service";
import { checkRateLimit, rateLimitKey } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

// GET /api/v1/documents/:id/intelligence — fetch or lazily generate
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = checkRateLimit(rateLimitKey(req, `GET /intelligence:${id}`), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const report = await ensureIntelligence(id);
  if (!report) return NextResponse.json({ error: "Failed to generate intelligence" }, { status: 500 });

  return NextResponse.json({ intelligence: report });
}

// POST /api/v1/documents/:id/intelligence — force re-extraction (zero-trust: re-validate source)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rl = checkRateLimit(rateLimitKey(req, `POST /intelligence:${id}`), { max: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const doc = await db.document.findUnique({ where: { id } });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const report = await ensureIntelligence(id, { force: true });
  if (!report) return NextResponse.json({ error: "Failed to generate intelligence" }, { status: 500 });

  return NextResponse.json({ intelligence: report });
}
