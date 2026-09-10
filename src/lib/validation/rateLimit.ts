// Simple in-memory rate limiting for the MVP (per-IP, per-route).
// For production use Redis; here we keep it zero-dependency and lightweight.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

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
  const ip = (req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown").split(",")[0].trim();
  return `${route}:${ip}`;
}

// Periodically clean up expired buckets (cheap)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of buckets.entries()) if (now > v.resetAt) buckets.delete(k);
  }, 60_000).unref?.();
}
