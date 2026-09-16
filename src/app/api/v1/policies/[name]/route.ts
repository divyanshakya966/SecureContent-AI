import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { serializePolicy, logAudit, stringifyArr } from "@/lib/api/helpers";
import { isBuiltinPolicy, validatePolicyBuckets } from "@/lib/security/policies";
import { PolicyUpdateSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

const NAME_RE = /^[A-Z][A-Z0-9_]{1,59}$/;

async function loadPolicy(name: string) {
  if (!NAME_RE.test(name)) return null;
  return db.policy.findUnique({ where: { name } });
}

// PUT /api/v1/policies/[name] — update a CUSTOM policy. Built-ins are immutable.
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const rl = checkRateLimit(rateLimitKey(req, `PUT /api/v1/policies:${name}`), { max: 15, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 15) });

  if (isBuiltinPolicy(name)) {
    return NextResponse.json({ error: `"${name}" is a built-in policy and cannot be edited. Clone it to customize.` }, { status: 403, headers: rateLimitHeaders(rl, 15) });
  }
  const existing = await loadPolicy(name);
  if (!existing) return NextResponse.json({ error: "Policy not found." }, { status: 404, headers: rateLimitHeaders(rl, 15) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(PolicyUpdateSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 15) });
  const data = parsed.data;

  // Validate the merged bucket set so partial updates can't smuggle conflicts.
  const current = serializePolicy(existing);
  const merged = {
    allow: data.allow ?? current.allow,
    mask: data.mask ?? current.mask,
    remove: data.remove ?? current.remove,
    block: data.block ?? current.block,
  };
  const bucketErrors = validatePolicyBuckets(merged);
  if (bucketErrors.length > 0) {
    return NextResponse.json({ error: bucketErrors.join(" ") }, { status: 400, headers: rateLimitHeaders(rl, 15) });
  }

  const updated = await db.policy.update({
    where: { name },
    data: {
      ...(data.description !== undefined ? { description: data.description } : {}),
      ...(data.classification !== undefined ? { classification: data.classification } : {}),
      ...(data.audience !== undefined ? { audience: data.audience } : {}),
      ...(data.allow !== undefined ? { allow: stringifyArr(data.allow) } : {}),
      ...(data.mask !== undefined ? { mask: stringifyArr(data.mask) } : {}),
      ...(data.remove !== undefined ? { remove: stringifyArr(data.remove) } : {}),
      ...(data.block !== undefined ? { block: stringifyArr(data.block) } : {}),
      ...(data.active !== undefined ? { active: data.active } : {}),
    },
  });
  await logAudit({ actor: "analyst", action: "POLICY_UPDATE", detail: `Updated custom policy "${name}".` });
  return NextResponse.json({ policy: serializePolicy(updated) }, { headers: rateLimitHeaders(rl, 15) });
}

// DELETE /api/v1/policies/[name] — delete a CUSTOM policy. Built-ins are protected.
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const rl = checkRateLimit(rateLimitKey(req, `DELETE /api/v1/policies:${name}`), { max: 15, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 15) });

  if (isBuiltinPolicy(name)) {
    return NextResponse.json({ error: `"${name}" is a built-in policy and cannot be deleted. Deactivate it instead.` }, { status: 403, headers: rateLimitHeaders(rl, 15) });
  }
  const existing = await loadPolicy(name);
  if (!existing) return NextResponse.json({ error: "Policy not found." }, { status: 404, headers: rateLimitHeaders(rl, 15) });

  await db.policy.delete({ where: { name } });
  await logAudit({ actor: "analyst", action: "POLICY_DELETE", detail: `Deleted custom policy "${name}". Documents sanitized under it keep their working copies.` });
  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl, 15) });
}
