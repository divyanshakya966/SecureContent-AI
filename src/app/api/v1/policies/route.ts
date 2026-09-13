import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePolicy, ensureDefaultPolicies, stringifyArr } from "@/lib/api/helpers";
import { PolicyCreateSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(req, "GET /api/v1/policies"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }
  await ensureDefaultPolicies();
  const rows = await db.policy.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json({ policies: rows.map(serializePolicy) }, { headers: rateLimitHeaders(rl, 60) });
}

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(rateLimitKey(req, "POST /api/v1/policies"), { max: 15, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 15) });
  }
  await ensureDefaultPolicies();
  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(PolicyCreateSchema, body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 15) });
  }
  const data = parsed.data;

  try {
    const created = await db.policy.create({
      data: {
        name: data.name,
        description: data.description ?? "",
        classification: data.classification ?? "INTERNAL",
        audience: data.audience ?? data.classification ?? "INTERNAL",
        allow: stringifyArr(data.allow ?? []),
        mask: stringifyArr(data.mask ?? []),
        remove: stringifyArr(data.remove ?? []),
        block: stringifyArr(data.block ?? []),
        active: data.active ?? true,
      },
    });
    return NextResponse.json({ policy: serializePolicy(created) }, { status: 201, headers: rateLimitHeaders(rl, 15) });
  } catch (e: unknown) {
    // Unique constraint violation → 409
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Unique constraint") || msg.includes("UNIQUE")) {
      return NextResponse.json({ error: "Policy with this name already exists." }, { status: 409, headers: rateLimitHeaders(rl, 15) });
    }
    throw e;
  }
}
