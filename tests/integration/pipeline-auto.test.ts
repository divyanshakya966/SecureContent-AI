import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";
import fs from "fs";

// Full auto-pipeline route test against an isolated temp SQLite DB.
// Transform runs the offline deterministic fallback (VITEST=true), so no LLM keys needed.
const TEST_DB = "/tmp/sc-pipeline-auto-test.db";

let db: typeof import("@/lib/db").db;
let scanContent: typeof import("@/lib/security").scanContent;
let computeRisk: typeof import("@/lib/security").computeRisk;
let POST: typeof import("@/app/api/v1/documents/[id]/pipeline/route").POST;
let NextRequestCtor: typeof import("next/server").NextRequest;
let docId: string;

const CONTENT = `Quarterly incident review prepared by Rahul Sharma (rahul.sharma@example.org, +91-98765-43210).
On 12-Apr the authentication service became unresponsive for 38 minutes. The on-call team confirmed an
elevated 5xx rate, identified a saturated database connection pool, raised the ceiling, and recovered service.
Follow-ups include connection lifecycle tests and pool saturation alerts at seventy percent.`;

async function readSse(res: Response): Promise<any[]> {
  const text = await res.text();
  const events: any[] = [];
  for (const part of text.split("\n\n")) {
    for (const line of part.split("\n")) {
      if (!line.startsWith("data:")) continue;
      try { events.push(JSON.parse(line.slice(5).trim())); } catch { /* ignore */ }
    }
  }
  return events;
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  try { fs.unlinkSync(TEST_DB); } catch { /* fresh */ }
  execSync("bunx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: "pipe",
  });

  ({ db } = await import("@/lib/db"));
  ({ scanContent, computeRisk } = await import("@/lib/security"));
  ({ POST } = await import("@/app/api/v1/documents/[id]/pipeline/route"));
  ({ NextRequest: NextRequestCtor } = await import("next/server"));

  const findings = scanContent(CONTENT);
  expect(findings.length).toBeGreaterThan(0);
  const risk = computeRisk(findings);
  const doc = await db.document.create({
    data: {
      filename: "auto-pipeline-test.txt",
      mimeType: "text/plain",
      sizeBytes: Buffer.byteLength(CONTENT, "utf8"),
      title: "Auto Pipeline Test",
      sourceKind: "PASTE",
      classification: risk.classification,
      status: "SCANNED",
      riskScore: risk.total,
      riskBefore: risk.total,
      riskAfter: 0,
      rawContent: CONTENT,
      metadata: "{}",
      findings: {
        create: findings.map((f) => ({
          category: f.category,
          type: f.type,
          severity: f.severity,
          confidence: f.confidence,
          action: f.defaultAction,
          stage: f.stage,
          location: `char_offset:${f.start}-${f.end}`,
          matchedText: f.matchedText,
          maskedText: f.maskedText,
          reason: f.reason,
        })),
      },
    },
  });
  docId = doc.id;
}, 120_000);

afterAll(async () => {
  try { await db.$disconnect(); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
});

describe("Auto pipeline route (SSE)", () => {
  it("sanitizes, transforms two artefacts, validates, and streams every stage", async () => {
    const req = new NextRequestCtor(`http://localhost/api/v1/documents/${docId}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: "PUBLIC_RELEASE", outputTypes: ["EXECUTIVE_SUMMARY", "FAQ"] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: docId }) });
    expect(res.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readSse(res);
    const names = events.map((e) => e.event);
    expect(names[0]).toBe("sanitize-start");
    expect(names).toContain("sanitize-done");
    expect(events.filter((e) => e.event === "transform-start")).toHaveLength(2);
    expect(events.filter((e) => e.event === "transform-done")).toHaveLength(2);
    expect(names[names.length - 1]).toBe("done");

    const done = events[events.length - 1];
    expect(done.transformations).toHaveLength(2);
    expect(done.errors).toEqual([]);
    // Sanitized outputs must not leak the raw PII.
    for (const t of done.transformations) {
      expect(t.outputContent).not.toContain("rahul.sharma@example.org");
    }

    const fresh = await db.document.findUnique({ where: { id: docId }, include: { transformations: true } });
    expect(fresh?.status).toBe("TRANSFORMED");
    expect(fresh?.sanitizedContent).not.toContain("rahul.sharma@example.org");
    expect(fresh?.transformations).toHaveLength(2);
    const audits = await db.auditLog.findMany({ where: { documentId: docId } });
    const actions = audits.map((a) => a.action);
    expect(actions).toContain("POLICY_APPLY");
    expect(actions).toContain("TRANSFORM");
  }, 90_000);

  it("reports blocked documents as an SSE blocked event", async () => {
    // A secrets-only dump has no usable prose → policy blocks.
    const raw = "AKIAZSI7QXAMPLEKEY";
    const { scanContent: sc, computeRisk: cr } = { scanContent, computeRisk };
    const findings = sc(raw);
    const risk = cr(findings);
    const blocked = await db.document.create({
      data: {
        filename: "blocked.txt", mimeType: "text/plain",
        sizeBytes: Buffer.byteLength(raw, "utf8"), title: "Blocked Doc",
        sourceKind: "PASTE", classification: risk.classification, status: "SCANNED",
        riskScore: risk.total, riskBefore: risk.total, riskAfter: 0,
        rawContent: raw, metadata: "{}",
        findings: {
          create: findings.map((f) => ({
            category: f.category, type: f.type, severity: f.severity,
            confidence: f.confidence, action: f.defaultAction, stage: f.stage,
            location: `char_offset:${f.start}-${f.end}`,
            matchedText: f.matchedText, maskedText: f.maskedText, reason: f.reason,
          })),
        },
      },
    });
    const req = new NextRequestCtor(`http://localhost/api/v1/documents/${blocked.id}/pipeline`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ policy: "PUBLIC_RELEASE", outputTypes: ["EXECUTIVE_SUMMARY"] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: blocked.id }) });
    const events = await readSse(res);
    const names = events.map((e) => e.event);
    expect(names).toContain("blocked");
    expect(names).not.toContain("done");
  }, 90_000);
});
