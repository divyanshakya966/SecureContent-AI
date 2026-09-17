// Optional bearer-token auth for mutating API routes + seed gating.
// If API_AUTH_TOKEN is unset, the instance runs open (local/dev default).
// If set, POST/PUT/DELETE under /api/v1/* require Authorization: Bearer <token>.
// GETs stay readable so dashboards/monitors keep working; set REQUIRE_AUTH_FOR_READS=true
// to lock those too. Cloud deployments SHOULD set API_AUTH_TOKEN.

const TOKEN_ENV = "API_AUTH_TOKEN";

function normalizeToken(v: string | undefined | null): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "");
}

export function isAuthEnabled(): boolean {
  return normalizeToken(process.env[TOKEN_ENV]).length >= 16;
}

export function isSeedEnabled(): boolean {
  // Seed is a demo/bootstrap helper: allow in dev/test, or explicitly in prod.
  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") return true;
  if (process.env.NODE_ENV !== "production") return true;
  const v = (process.env.ALLOW_SEED ?? "").trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function timingSafeEqual(a: string, b: string): boolean {
  // Constant-time compare to avoid trivial timing oracles on the token.
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkApiAuth(req: Request): { ok: boolean; reason?: string } {
  if (!isAuthEnabled()) return { ok: true };
  const expected = normalizeToken(process.env[TOKEN_ENV]);
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!m) return { ok: false, reason: "Missing Authorization: Bearer token." };
  const provided = normalizeToken(m[1]);
  if (!timingSafeEqual(provided, expected)) return { ok: false, reason: "Invalid API token." };
  return { ok: true };
}

/** Enforce auth for state-changing requests. Returns a 401 Response or null. */
export function requireApiAuth(req: Request): Response | null {
  const method = req.method.toUpperCase();
  const needsAuth = method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
  const lockReads = ["true", "1", "yes"].includes((process.env.REQUIRE_AUTH_FOR_READS ?? "").trim().toLowerCase());
  if (!needsAuth && !lockReads) return null;
  const check = checkApiAuth(req);
  if (check.ok) return null;
  return Response.json({ error: `Unauthorized — ${check.reason ?? "invalid token."}` }, { status: 401 });
}

/** Sanitize free-form strings before embedding in audit logs / error messages. */
export function safeLogDetail(s: string, max = 180): string {
  const oneLine = (s ?? "").replace(/[\r\n\x00-\x1F\x7F]+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return `${oneLine.slice(0, max - 1)}…`;
}
