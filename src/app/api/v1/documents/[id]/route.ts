import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit } from "@/lib/api/helpers";
import { DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(rateLimitKey(req, "GET /documents/:id"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400, headers: rateLimitHeaders(rl, 60) });

  const doc = await db.document.findUnique({
    where: { id },
    include: {
      findings: { orderBy: { createdAt: "asc" } },
      transformations: { orderBy: { createdAt: "desc" } },
      intelligence: true,
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 60) });
  return NextResponse.json({ document: serializeDocument(doc) }, { headers: rateLimitHeaders(rl, 60) });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rl = checkRateLimit(rateLimitKey(req, "DELETE /documents/:id"), { max: 20, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 20) });
  }
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400, headers: rateLimitHeaders(rl, 20) });

  const existing = await db.document.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404, headers: rateLimitHeaders(rl, 20) });

  await db.document.delete({ where: { id } });
  await logAudit({ documentId: null, actor: "analyst", action: "DELETE", detail: `Deleted document ${id} ("${existing.title}").` });
  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl, 20) });
}
