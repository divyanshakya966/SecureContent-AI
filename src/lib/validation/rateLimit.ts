// In-memory token bucket rate limiter (per-IP, per-route).
// Production deployments should replace this with a distributed store (Redis / Upstash)
// and enable trust-proxy validation at the edge. The interface is intentionally
// compatible so the swap is a one-line change.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Hard cap so a flood of distinct keys (e.g. spoofed IPs) can't grow memory unbounded. */
const MAX_BUCKETS = 10_000;

function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;
  // First drop expired buckets…
  for (const [k, v] of buckets.entries()) {
    if (now > v.resetAt) buckets.delete(k);
    if (buckets.size < MAX_BUCKETS) return;
  }
  // …then oldest-inserted (Map preserves insertion order).
  for (const k of buckets.keys()) {
    buckets.delete(k);
    if (buckets.size < MAX_BUCKETS) return;
  }
}

export interface RateLimitOpts {
  windowMs?: number; // default 60_000
  max?: number; // default 30
}

export function checkRateLimit(key: string, opts: RateLimitOpts = {}): { allowed: boolean; remaining: number; resetMs: number } {
  const now = Date.now();
  const windowMs = opts.windowMs ?? 60_000;
  const max = opts.max ?? 30;
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    evictIfNeeded(now);
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: max - 1, resetMs: windowMs };
  }
  if (b.count >= max) {
    return { allowed: false, remaining: 0, resetMs: b.resetAt - now };
  }
  b.count++;
  return { allowed: true, remaining: max - b.count, resetMs: b.resetAt - now };
}

export function rateLimitKey(req: Request, route: string): string {
  // Prefer x-real-ip (set by Caddy / trusted proxy) over x-forwarded-for which
  // is client-controllable. In this single-tenant demo we treat either as a hint
  // and rate-limit permissively; a production IdP would key by tenant + user.
  const xRealIp = req.headers.get("x-real-ip")?.split(",")[0]?.trim();
  const xForwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = xRealIp || xForwardedFor || "unknown";
  // Basic sanity: if the IP looks spoofed (too long / not IP-like), treat as unknown.
  const normalized = ip.length > 45 || /[^\d.:a-fA-F]/.test(ip.replace(/,/g, "")) ? "unknown" : ip;
  return `${route}:${normalized}`;
}

export function rateLimitHeaders(result: { allowed: boolean; remaining: number; resetMs: number }, max: number): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(max),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(result.resetMs / 1000)),
    ...(result.allowed ? {} : { "Retry-After": String(Math.ceil(result.resetMs / 1000)) }),
  };
}

/** For tests: reset all buckets. */
export function _resetRateLimitBuckets(): void {
  buckets.clear();
}

// Periodically clean up expired buckets
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) if (now > v.resetAt) buckets.delete(k);
  }, 60_000).unref?.();
}
