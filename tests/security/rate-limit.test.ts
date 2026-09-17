import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, checkGlobalRateLimit, rateLimitKey, _resetRateLimitBuckets } from "@/lib/validation/rateLimit";

function req(ipHeaders: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/v1/documents/batch", { headers: ipHeaders });
}

describe("rate limiting", () => {
  beforeEach(() => _resetRateLimitBuckets());

  it("enforces per-IP buckets and emits headers data", () => {
    const key = rateLimitKey(req({ "x-real-ip": "1.2.3.4" }), "POST /test");
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit(key, { max: 5 }).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key, { max: 5 });
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetMs).toBeGreaterThan(0);
  });

  it("treats spoofed IPs as unknown (single shared bucket)", () => {
    const a = rateLimitKey(req({ "x-real-ip": "1.2.3.4; rm -rf" }), "R");
    const b = rateLimitKey(req({ "x-forwarded-for": "a".repeat(100) }), "R");
    expect(a).toContain("unknown");
    expect(b).toContain("unknown");
  });

  it("global backstop triggers regardless of IP rotation", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkGlobalRateLimit("POST /expensive", { max: 3 }).allowed).toBe(true);
    }
    expect(checkGlobalRateLimit("POST /expensive", { max: 3 }).allowed).toBe(false);
  });
});
