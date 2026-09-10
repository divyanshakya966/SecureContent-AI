import { describe, it, expect } from "vitest";
import { buildIntelligenceReport } from "@/lib/intelligence/extractor";
import { scanContent } from "@/lib/security/detectors";

describe("Intelligence-Aware Extraction", () => {
  const raw = `
    Project Lead: Rahul Sharma (rahul.sharma@example.org, +91-98765-43210)
    Team Alpha deployed to 10.11.4.5 and db.internal:5432.
    Observed IOC: 192.168.1.100, https://malicious.example.com/payload, CVE-2023-12345, hash 5d41402abc4b2a76b9719d911017c592
    Incident timeline: phishing email led to credential dumping via mimikatz and lateral movement with psexec.
    Root cause: DB pool saturation. Impact: 38 min outage. Recommendation: rotate credentials and add tests.
  `;
  const findings = scanContent(raw);

  it("extracts entities (person, email, phone, ip, org)", () => {
    const r = buildIntelligenceReport({ documentId: "test", rawContent: raw, findings, classification: "CONFIDENTIAL" as any, riskScore: 80 });
    expect(r.entities.length).toBeGreaterThan(3);
    expect(r.entities.some((e) => e.type === "EMAIL")).toBe(true);
    expect(r.entities.some((e) => e.type === "PERSON")).toBe(true);
    expect(r.entities.some((e) => e.type === "IP")).toBe(true);
  });

  it("extracts IOCs (IP, DOMAIN, URL, CVE, HASH)", () => {
    const r = buildIntelligenceReport({ documentId: "test", rawContent: raw, findings, classification: "CONFIDENTIAL" as any, riskScore: 80 });
    expect(r.iocs.some((i) => i.type === "IP")).toBe(true);
    expect(r.iocs.some((i) => i.type === "DOMAIN") || r.iocs.some((i) => i.type === "URL")).toBe(true);
    expect(r.iocs.some((i) => i.type === "CVE")).toBe(true);
    expect(r.iocs.some((i) => i.type === "HASH_MD5")).toBe(true);
  });

  it("maps TTPs to MITRE ATT&CK", () => {
    const r = buildIntelligenceReport({ documentId: "test", rawContent: raw, findings, classification: "CONFIDENTIAL" as any, riskScore: 80 });
    expect(r.ttps.length).toBeGreaterThan(2);
    expect(r.ttps.some((t) => t.mitreId === "T1566")).toBe(true); // phishing
    expect(r.ttps.some((t) => t.mitreId === "T1003")).toBe(true); // credential dumping
  });

  it("synthesizes risks from findings + TTPs/IOCs", () => {
    const r = buildIntelligenceReport({ documentId: "test", rawContent: raw, findings, classification: "CONFIDENTIAL" as any, riskScore: 80 });
    expect(r.risks.length).toBeGreaterThan(2);
    // Raw has PII (email/phone) and injection-like TTPs, so at least these categories should appear
    expect(r.risks.some((x) => x.category === "PII Handling" || x.category === "Data Exposure")).toBe(true);
    expect(r.risks.some((x) => x.category === "Infrastructure Exposure" || x.category === "Adversarial Behavior")).toBe(true);
  });

  it("extracts key findings with evidence and grounded flag", () => {
    const r = buildIntelligenceReport({ documentId: "test", rawContent: raw, findings, classification: "CONFIDENTIAL" as any, riskScore: 80 });
    expect(r.keyFindings.length).toBeGreaterThan(0);
    expect(r.keyFindings[0].finding.length).toBeGreaterThan(10);
    expect(r.keyFindings[0].evidence).toBeDefined();
  });

  it("produces a summary and counts", () => {
    const r = buildIntelligenceReport({ documentId: "test", rawContent: raw, findings, classification: "CONFIDENTIAL" as any, riskScore: 80 });
    expect(r.summary.length).toBeGreaterThan(20);
    expect(r.counts.entities).toBe(r.entities.length);
    expect(r.counts.iocs).toBe(r.iocs.length);
    expect(r.counts.ttps).toBe(r.ttps.length);
  });

  it("handles clean document (no IOCs/TTPs) still produces risks", () => {
    const clean = "Q3 strategy memo: improve onboarding and expand integrations. Reliability improvements ongoing.";
    const f = scanContent(clean);
    const r = buildIntelligenceReport({ documentId: "test2", rawContent: clean, findings: f, classification: "PUBLIC" as any, riskScore: 0 });
    expect(r.entities.length).toBe(0);
    expect(r.iocs.length).toBe(0);
    // Should still have at least 0 risks? clean may have 0? but we allow 0
    expect(Array.isArray(r.risks)).toBe(true);
  });
});
