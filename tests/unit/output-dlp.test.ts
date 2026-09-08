import { describe, it, expect } from "vitest";
import { runOutputDlp } from "@/lib/security/output-dlp";
import { DEFAULT_POLICIES } from "@/lib/security/policies";
import type { PolicyRule } from "@/types";

function policy(name: string): PolicyRule {
  const p = DEFAULT_POLICIES.find((x) => x.name === name)!;
  return {
    id: "test",
    name: p.name,
    description: p.description,
    classification: p.classification as any,
    allow: [...p.allow],
    mask: [...p.mask],
    remove: [...p.remove],
    block: [...p.block],
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("Output DLP", () => {
  it("passes clean output", () => {
    const r = runOutputDlp("This is a clean summary with no sensitive data.", policy("PUBLIC_RELEASE"));
    expect(r.passed).toBe(true);
    expect(r.leakageFindings.length).toBe(0);
  });
  it("fails when email leaks into output", () => {
    const r = runOutputDlp("Contact author at rahul.sharma@example.org", policy("PUBLIC_RELEASE"));
    expect(r.passed).toBe(false);
    expect(r.leakageFindings.length).toBeGreaterThan(0);
    expect(r.repairedContent).not.toContain("rahul.sharma@example.org");
  });
  it("fails when secret leaks and repairs automatically", () => {
    const r = runOutputDlp("Key is AKIAZSI7QXAMPLEKEY please rotate.", policy("PUBLIC_RELEASE"));
    expect(r.passed).toBe(false);
    expect(r.repairedContent).not.toContain("AKIAZSI7QXAMPLEKEY");
  });
  it("reasons include detail for reviewers", () => {
    const r = runOutputDlp("Email test@example.org and phone +91-98765-43210", policy("PUBLIC_RELEASE"));
    expect(r.reasons.join(" ")).toMatch(/Detected|EMAIL|PHONE/i);
  });
});
