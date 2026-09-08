import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePolicy, ensureDefaultPolicies, stringifyArr } from "@/lib/api/helpers";

export const runtime = "nodejs";

export async function GET() {
  await ensureDefaultPolicies();
  const rows = await db.policy.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ policies: rows.map(serializePolicy) });
}

export async function POST(req: NextRequest) {
  await ensureDefaultPolicies();
  const body = await req.json().catch(() => ({} as any));
  if (!body.name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const created = await db.policy.create({
    data: {
      name: body.name,
      description: body.description || "",
      classification: body.classification || "INTERNAL",
      allow: stringifyArr(body.allow || []),
      mask: stringifyArr(body.mask || []),
      remove: stringifyArr(body.remove || []),
      block: stringifyArr(body.block || []),
      active: body.active ?? true,
    },
  });
  return NextResponse.json({ policy: serializePolicy(created) }, { status: 201 });
}
