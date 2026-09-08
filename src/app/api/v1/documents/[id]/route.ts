import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeDocument, logAudit } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const doc = await db.document.findUnique({
    where: { id },
    include: {
      findings: { orderBy: { createdAt: "asc" } },
      transformations: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ document: serializeDocument(doc) });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await db.document.delete({ where: { id } });
    await logAudit({ documentId: null, actor: "analyst", action: "UPLOAD", detail: `Deleted document ${id}.` });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
