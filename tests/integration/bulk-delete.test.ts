import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";

// Bulk-delete route tests against an isolated temp SQLite DB.
const TEST_DB = "/tmp/sc-bulk-delete-test.db";

let db: typeof import("@/lib/db").db;
let POST: typeof import("@/app/api/v1/documents/bulk-delete/route").POST;
let NextRequestCtor: typeof import("next/server").NextRequest;
let resetBuckets: typeof import("@/lib/validation/rateLimit")._resetRateLimitBuckets;

function req(body: unknown) {
  return new NextRequestCtor("http://localhost/api/v1/documents/bulk-delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeDoc(title: string, withExtras = false): Promise<string> {
  const doc = await db.document.create({
    data: {
      filename: `${title}.txt`, mimeType: "text/plain",
      sizeBytes: 100, title, sourceKind: "PASTE",
      classification: "PUBLIC", status: "SCANNED",
      riskScore: 5, riskBefore: 5, riskAfter: 0,
      rawContent: `Content for ${title} with contact test-${title}@example.org.`,
      metadata: "{}",
      findings: {
        create: [{
          category: "PII", type: "EMAIL", severity: "MEDIUM", confidence: 0.9,
          action: "MASK", stage: "INPUT", location: "char_offset:1-5",
          matchedText: "x@y.zz", maskedText: "[X]", reason: "test",
        }],
      },
    },
  });
  if (withExtras) {
    await db.transformation.create({
      data: { documentId: doc.id, profile: "PUBLIC_RELEASE", outputType: "FAQ", model: "test" },
    });
    await db.intelligenceReport.create({ data: { documentId: doc.id } });
  }
  return doc.id;
}

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  try { fs.unlinkSync(TEST_DB); } catch { /* fresh */ }
  execSync("bunx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: "pipe",
  });
  ({ db } = await import("@/lib/db"));
  ({ POST } = await import("@/app/api/v1/documents/bulk-delete/route"));
  ({ NextRequest: NextRequestCtor } = await import("next/server"));
  ({ _resetRateLimitBuckets: resetBuckets } = await import("@/lib/validation/rateLimit"));
}, 120_000);

beforeEach(async () => {
  resetBuckets();
  await db.auditLog.deleteMany({});
  await db.transformation.deleteMany({});
  await db.intelligenceReport.deleteMany({});
  await db.finding.deleteMany({});
  await db.document.deleteMany({});
});

afterAll(async () => {
  try { await db.$disconnect(); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
});

describe("Bulk delete route", () => {
  it("deletes many documents with cascade and audits once", async () => {
    const a = await makeDoc("bulk-a", true);
    const b = await makeDoc("bulk-b");
    const keep = await makeDoc("bulk-keep");
    const ghost = "c".repeat(24); // valid shape, matches nothing

    const res = await POST(req({ ids: [a, b, ghost] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deleted).toBe(2);
    expect(body.ids.sort()).toEqual([a, b].sort());

    expect(await db.document.findUnique({ where: { id: a } })).toBeNull();
    expect(await db.document.findUnique({ where: { id: b } })).toBeNull();
    expect(await db.document.findUnique({ where: { id: keep } })).not.toBeNull();
    // Cascade: findings, transformations, intelligence of deleted docs are gone.
    expect(await db.finding.count({ where: { documentId: { in: [a, b] } } })).toBe(0);
    expect(await db.transformation.count({ where: { documentId: a } })).toBe(0);
    expect(await db.intelligenceReport.count({ where: { documentId: a } })).toBe(0);
    // Kept document's finding survives.
    expect(await db.finding.count({ where: { documentId: keep } })).toBe(1);
    const audit = await db.auditLog.findFirst({ where: { action: "BULK_DELETE" } });
    expect(audit?.detail).toMatch(/Bulk deleted 2/);
  }, 90_000);

  it("rejects empty, oversized, and malformed id lists", async () => {
    expect((await POST(req({ ids: [] }))).status).toBe(400);
    expect((await POST(req({ ids: Array.from({ length: 101 }, (_, i) => `id-number-${String(i).padStart(3, "0")}`) }))).status).toBe(400);
    expect((await POST(req({ ids: ["short"] }))).status).toBe(400);
    expect((await POST(req({ ids: ["z".repeat(24)] }))).status).toBe(404);
  }, 90_000);
});
