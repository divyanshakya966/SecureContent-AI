import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkApiAuth, requireApiAuth, isAuthEnabled, isSeedEnabled, safeLogDetail } from "@/lib/auth";

const TOKEN = "test-token-1234567890-long-enough";

beforeEach(() => {
  process.env.API_AUTH_TOKEN = TOKEN;
  vi.stubEnv("VITEST", "true");
});

afterEach(() => {
  delete process.env.API_AUTH_TOKEN;
  vi.unstubAllEnvs();
});

function req(method = "POST", auth?: string): Request {
  const headers: Record<string, string> = {};
  if (auth) headers.authorization = auth;
  return new Request("http://localhost/api/v1/documents", { method, headers });
}

describe("API bearer auth", () => {
  it("is disabled when no token is configured", () => {
    delete process.env.API_AUTH_TOKEN;
    expect(isAuthEnabled()).toBe(false);
    expect(checkApiAuth(req("POST")).ok).toBe(true);
    expect(requireApiAuth(req("POST"))).toBeNull();
  });

  it("allows valid bearer token on mutating routes", () => {
    expect(checkApiAuth(req("POST", `Bearer ${TOKEN}`)).ok).toBe(true);
    expect(requireApiAuth(req("POST", `Bearer ${TOKEN}`))).toBeNull();
    expect(requireApiAuth(req("DELETE", `Bearer ${TOKEN}`))).toBeNull();
  });

  it("rejects missing / wrong tokens with 401", () => {
    expect(requireApiAuth(req("POST"))?.status).toBe(401);
    expect(requireApiAuth(req("POST", "Bearer wrong"))?.status).toBe(401);
    expect(requireApiAuth(req("POST", "Token abc"))?.status).toBe(401);
  });

  it("leaves GETs open by default, locks them when configured", () => {
    expect(requireApiAuth(req("GET"))).toBeNull();
    process.env.REQUIRE_AUTH_FOR_READS = "true";
    expect(requireApiAuth(req("GET"))?.status).toBe(401);
    expect(requireApiAuth(req("GET", `Bearer ${TOKEN}`))).toBeNull();
    delete process.env.REQUIRE_AUTH_FOR_READS;
  });

  it("short tokens do not enable auth (misconfiguration guard)", () => {
    process.env.API_AUTH_TOKEN = "short";
    expect(isAuthEnabled()).toBe(false);
  });
});

describe("seed gating", () => {
  it("is enabled in test env", () => {
    expect(isSeedEnabled()).toBe(true);
  });
});

describe("safeLogDetail", () => {
  it("strips newlines/controls and truncates", () => {
    expect(safeLogDetail("a\nb\rc", 10)).toBe("a b c");
    expect(safeLogDetail("x".repeat(500), 180).length).toBeLessThanOrEqual(180);
  });
});
