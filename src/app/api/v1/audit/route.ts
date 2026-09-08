import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializeAudit } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET() {
  const audit = await db.auditLog.findMany({
    orderBy: { timestamp: "desc" },
    take: 100,
    include: { document: { select: { title: true, filename: true } } },
  });
  return NextResponse.json({ audit: audit.map(serializeAudit) });
}
