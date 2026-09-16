import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePolicy, ensureDefaultPolicies, stringifyArr, logAudit } from "@/lib/api/helpers";
import { isBuiltinPolicy, validatePolicyBuckets, BUILTIN_POLICY_NAMES } from "@/lib/security/policies";
import { PolicyCreateSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

/** Cap on user-created policies — bounds table growth from automation. */
const MAX_CUSTOM_POLICIES = 50;

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

  // Built-in names are reserved — clone under a new name instead.
  if (isBuiltinPolicy(data.name)) {
    return NextResponse.json({ error: `"${data.name}" is a built-in policy and cannot be recreated. Clone it under a new name.` }, { status: 409, headers: rateLimitHeaders(rl, 15) });
  }

  // Shared bucket validation: known entries only, one bucket per entry,
  // and never allow-list credentials or injections.
  const bucketErrors = validatePolicyBuckets({ allow: data.allow, mask: data.mask, remove: data.remove, block: data.block });
  if (bucketErrors.length > 0) {
    return NextResponse.json({ error: bucketErrors.join(" ") }, { status: 400, headers: rateLimitHeaders(rl, 15) });
  }

  const customCount = await db.policy.count({ where: { name: { notIn: [...BUILTIN_POLICY_NAMES] } } });
  if (customCount >= MAX_CUSTOM_POLICIES) {
    return NextResponse.json({ error: `Custom policy limit reached (${MAX_CUSTOM_POLICIES}). Delete an unused policy first.` }, { status: 409, headers: rateLimitHeaders(rl, 15) });
  }

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
    await logAudit({ actor: "analyst", action: "POLICY_CREATE", detail: `Created custom policy "${created.name}" (${created.classification}, audience ${created.audience}).` });
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
