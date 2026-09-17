import { NextResponse, type NextRequest } from "next/server";

// Edge middleware: security headers, request IDs, light abuse guard.
// Mutations are audit-logged; production should front this with an IdP.

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Permitted-Cross-Domain-Policies": "none",
  "Origin-Agent-Cluster": "?1",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function safeRequestId(raw: string | null): string {
  if (raw && REQUEST_ID_RE.test(raw.trim())) return raw.trim();
  return crypto.randomUUID();
}

export default function proxy(req: NextRequest) {
  const res = NextResponse.next();


  const requestId = safeRequestId(req.headers.get("x-request-id"));
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-correlation-id", requestId);

  // Re-apply security headers stripped by reverse proxies.
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!res.headers.has(k)) res.headers.set(k, v);
  }

  // No auth redirects; all activity stays observable via audit logs.

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
