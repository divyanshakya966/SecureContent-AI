import { describe, it, expect } from "vitest";
import { scanContent, sanitizeContent, runOutputDlp } from "@/lib/security";
import { SAMPLE_DOCUMENTS } from "@/lib/security/samples";
import { DEFAULT_POLICIES } from "@/lib/security/policies";
import type { PolicyRule } from "@/types";

function policy(name: string): PolicyRule {
  const p = DEFAULT_POLICIES.find((x) => x.name === name)!;
  return { id: "test", name: p.name, description: p.description, classification: p.classification as any, allow: [...p.allow], mask: [...p.mask], remove: [...p.remove], block: [...p.block], active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
}

describe("Red-team synthetic benchmark (attack-driven demo)", () => {
  for (const sample of SAMPLE_DOCUMENTS) {
    it(`${sample.id} (${sample.category}) is correctly classified and sanitized`, () => {
      const findings = scanContent(sample.content);
      const byCat = (c: string) => findings.filter((f) => f.category === c).length;

      if (sample.category === "CLEAN") {
        expect(findings.length).toBeLessThanOrEqual(2);
      }
      if (sample.category === "PII_HEAVY") {
        expect(byCat("PII")).toBeGreaterThan(3);
      }
      if (sample.category === "SECRET_HEAVY") {
        expect(byCat("SECRET")).toBeGreaterThan(2);
      }
      if (sample.category === "INJECTION") {
        expect(byCat("PROMPT_INJECTION")).toBeGreaterThan(3);
      }
      if (sample.category === "MIXED") {
        expect(findings.length).toBeGreaterThan(4);
        expect(byCat("PROMPT_INJECTION")).toBeGreaterThan(0);
        expect(byCat("SECRET")).toBeGreaterThan(0);
      }

      // Sanitization must not leave raw secrets/PII verbatim for public profile
      const profile = sample.category === "INJECTION" || sample.category === "MIXED" ? "SECURITY_INCIDENT" : "PUBLIC_RELEASE";
      const sanitized = sanitizeContent(sample.content, findings, policy(profile));
      expect(sanitized.blocked).toBe(false);
      // No raw Aadhaar/PAN/AKIA should survive
      expect(sanitized.sanitizedContent).not.toContain("AKIAZSI7QXAMPLEKEY");
      if (sample.content.includes("2345 6789 0123")) {
        expect(sanitized.sanitizedContent).not.toContain("2345 6789 0123");
      }
      // Output DLP would also catch any residual leakage
      const dlp = runOutputDlp(sanitized.sanitizedContent, policy(profile));
      // sanitized content may still contain masked placeholders, but not raw secrets
      const hasRawSecret = dlp.leakageFindings.some((f) => f.matchedText.includes("AKIA"));
      expect(hasRawSecret).toBe(false);
    });
  }

  it("mixed document risk is higher than clean", () => {
    const clean = scanContent(SAMPLE_DOCUMENTS.find((s) => s.id === "sample-clean")!.content);
    const mixed = scanContent(SAMPLE_DOCUMENTS.find((s) => s.id === "sample-mixed")!.content);
    // Use raw risk totals — mixed has many more findings
    const cleanRisk = clean.reduce((a, f) => a + (f.severity === "CRITICAL" ? 35 : f.severity === "HIGH" ? 20 : 10), 0);
    const mixedRisk = mixed.reduce((a, f) => a + (f.severity === "CRITICAL" ? 35 : f.severity === "HIGH" ? 20 : 10), 0);
    expect(mixedRisk).toBeGreaterThan(cleanRisk);
  });
});
