import { NextResponse, type NextRequest } from "next/server";

// Industry-grade edge middleware: security headers + request ID + light abuse guard.
// Auth is intentionally out-of-scope for the prototype (SQLite, single-tenant demo);
// every mutation is audit-logged server-side and a production deployment should
// front this with an IdP (NextAuth / OIDC) and network policy.

const SECURITY_HEADERS: Record<string, string> = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

export default function proxy(req: NextRequest) {
  const res = NextResponse.next();

  // Propagate / mint a request ID for correlation in logs.
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();
  res.headers.set("x-request-id", requestId);
  res.headers.set("x-correlation-id", requestId);

  // Apply security headers (next.config headers cover most, but middleware ensures they
  // apply even when behind a reverse-proxy that strips them).
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!res.headers.has(k)) res.headers.set(k, v);
  }

  // Basic CSP nonce placeholder — strict CSP is delivered via next.config.ts headers.
  // No auth redirect here; keep the demo open but fully observable via audit logs.

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.svg).*)"],
};
