// In-memory token-bucket limiter (per-IP, per-route). Swap for Redis in production.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Hard cap so a flood of distinct keys (e.g. spoofed IPs) can't grow memory unbounded. */
const MAX_BUCKETS = 10_000;

function evictIfNeeded(now: number): void {
  if (buckets.size < MAX_BUCKETS) return;

  for (const [k, v] of buckets.entries()) {
    if (now > v.resetAt) buckets.delete(k);
    if (buckets.size < MAX_BUCKETS) return;
  }

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
  // Prefer x-real-ip (set/overwritten by Caddy in compose) over client-controllable x-forwarded-for.
  // Direct-to-app clients can spoof these headers, so callers should ALSO enforce a
  // global per-route bucket via checkGlobalRateLimit (below) as a spoof-proof backstop.
  const xRealIp = req.headers.get("x-real-ip")?.split(",")[0]?.trim();
  const xForwardedFor = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = xRealIp || xForwardedFor || "unknown";
  // Treat spoofed-looking IPs as unknown.
  const normalized = ip.length > 45 || /[^\d.:a-fA-F]/.test(ip.replace(/,/g, "")) ? "unknown" : ip;
  return `${route}:${normalized}`;
}

/** Global (IP-independent) bucket — backstop against header-spoofed bypass. */
export function checkGlobalRateLimit(route: string, opts: RateLimitOpts = {}): { allowed: boolean; remaining: number; resetMs: number } {
  return checkRateLimit(`GLOBAL:${route}`, opts);
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


if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) if (now > v.resetAt) buckets.delete(k);
  }, 60_000).unref?.();
}
