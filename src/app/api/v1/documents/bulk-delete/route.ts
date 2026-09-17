import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/api/helpers";
import { BulkDeleteSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

// Bulk delete (max 100): cascades children, preserves audits, ignores unknown ids.
export async function POST(req: NextRequest) {
  const _auth = requireApiAuth(req);
  if (_auth) return _auth;
  const rl = checkRateLimit(rateLimitKey(req, "POST /api/v1/documents/bulk-delete"), { max: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 10) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(BulkDeleteSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 10) });
  const ids = [...new Set(parsed.data.ids)];

  const existing = await db.document.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  if (existing.length === 0) {
    return NextResponse.json({ error: "No matching documents found." }, { status: 404, headers: rateLimitHeaders(rl, 10) });
  }

  const foundIds = existing.map((d) => d.id);
  const result = await db.document.deleteMany({ where: { id: { in: foundIds } } });
  await logAudit({
    documentId: null,
    actor: "analyst",
    action: "BULK_DELETE",
    detail: `Bulk deleted ${result.count} document(s): ${existing.slice(0, 5).map((d) => `"${d.title}"`).join(", ")}${existing.length > 5 ? ` +${existing.length - 5} more` : ""}. Findings and transformations removed with cascade.`,
  });

  return NextResponse.json({ deleted: result.count, ids: foundIds }, { headers: rateLimitHeaders(rl, 10) });
}
