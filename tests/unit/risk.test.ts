import { describe, it, expect } from "vitest";
import { computeRisk } from "@/lib/security/risk";
import type { RawFinding } from "@/lib/security/detectors";

function f(category: string, severity: any, confidence = 0.9, action: any = "REDACT"): RawFinding {
  return {
    category: category as any,
    type: "EMAIL" as any,
    severity,
    confidence,
    defaultAction: action,
    stage: "INPUT",
    start: 0,
    end: 5,
    matchedText: "x",
    maskedText: "[X]",
    reason: "test",
  };
}

describe("Risk scoring", () => {
  it("clean document scores 0 and PUBLIC", () => {
    const r = computeRisk([]);
    expect(r.total).toBe(0);
    expect(r.classification).toBe("PUBLIC");
  });
  it("critical secrets raise classification to CONFIDENTIAL+", () => {
    const findings = [f("SECRET", "CRITICAL", 0.95)];
    const r = computeRisk(findings);
    expect(r.total).toBeGreaterThan(0);
    expect(["CONFIDENTIAL", "RESTRICTED"]).toContain(r.classification as string);
  });
  it("prompt injection pushes to RESTRICTED when combined with secret", () => {
    const findings = [f("PROMPT_INJECTION", "CRITICAL", 0.95, "QUARANTINE"), f("SECRET", "CRITICAL", 0.95)];
    const r = computeRisk(findings);
    expect(r.classification).toBe("RESTRICTED");
  });
  it("risk is capped at 100", () => {
    const findings = Array.from({ length: 20 }, () => f("SECRET", "CRITICAL", 0.99));
    const r = computeRisk(findings);
    expect(r.total).toBeLessThanOrEqual(100);
  });
  it("breakdown categories sum roughly to total", () => {
    const findings = [f("PII", "MEDIUM", 0.97), f("SECRET", "HIGH", 0.9)];
    const r = computeRisk(findings);
    expect(r.pii).toBeGreaterThan(0);
    expect(r.secrets).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(0);
  });
});
