import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeTransformation, serializeAudit } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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
  return NextResponse.json({
    transformations: transformations.map(serializeTransformation),
    audit: audit.map(serializeAudit),
  });
}
