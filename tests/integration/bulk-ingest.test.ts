import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { execSync } from "child_process";
import fs from "fs";

// Bulk-ingest route tests against an isolated temp SQLite DB.
// Transforms use the offline deterministic fallback (VITEST=true).
const TEST_DB = "/tmp/sc-bulk-ingest-test.db";

let db: typeof import("@/lib/db").db;
let POST: typeof import("@/app/api/v1/documents/batch/route").POST;
let NextRequestCtor: typeof import("next/server").NextRequest;
let resetBuckets: typeof import("@/lib/validation/rateLimit")._resetRateLimitBuckets;

function file(name: string, content: string, type = "text/plain"): File {
  return new File([content], name, { type });
}

function req(files: File[], fields: Record<string, string> = {}) {
  const form = new FormData();
  for (const f of files) form.append("files", f, f.name);
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return new NextRequestCtor("http://localhost/api/v1/documents/batch", {
    method: "POST",
    body: form,
  });
}

const DOC_A = `Quarterly operations review by Priya Nair (priya.nair@example.org, +91-98111-22334).
The onboarding funnel improved after contextual guidance was added at step three. Integration coverage
grew across workflow tools and the platform reliability posture strengthened with automated recovery.`;
const DOC_B = `Regional sales summary for Q3. Pipeline coverage expanded across three territories with steady
enterprise demand. Follow-ups include hiring two account executives and refreshing collateral.`;

beforeAll(async () => {
  process.env.DATABASE_URL = `file:${TEST_DB}`;
  try { fs.unlinkSync(TEST_DB); } catch { /* fresh */ }
  execSync("bunx prisma db push --accept-data-loss", {
    env: { ...process.env, DATABASE_URL: `file:${TEST_DB}` },
    stdio: "pipe",
  });
  ({ db } = await import("@/lib/db"));
  ({ POST } = await import("@/app/api/v1/documents/batch/route"));
  ({ NextRequest: NextRequestCtor } = await import("next/server"));
  ({ _resetRateLimitBuckets: resetBuckets } = await import("@/lib/validation/rateLimit"));
}, 120_000);

beforeEach(() => {
  resetBuckets();
});

afterAll(async () => {
  try { await db.$disconnect(); } catch { /* ignore */ }
  try { fs.unlinkSync(TEST_DB); } catch { /* ignore */ }
});

describe("Bulk ingest route", () => {
  it("ingests multiple files with per-file outcomes", async () => {
    const res = await POST(req([file("a.txt", DOC_A), file("b.txt", DOC_B)], { policy: "PUBLIC_RELEASE" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.ingested).toBe(2);
    expect(body.results).toHaveLength(2);
    for (const r of body.results) {
      expect(r.status).toBe("ingested");
      expect(r.documentId).toBeTruthy();
    }
    const count = await db.document.count();
    expect(count).toBe(2);
  }, 90_000);

  it("skips duplicates and pipelines new files end to end", async () => {
    // Same content again → duplicates skipped, nothing re-ingested.
    const dup = await POST(
      req([file("a.txt", DOC_A), file("b.txt", DOC_B)], { policy: "PUBLIC_RELEASE", skipDuplicates: "true" })
    );
    const dupBody = await dup.json();
    expect(dupBody.summary.skipped).toBe(2);

    // New file with the auto pipeline → sanitized, transformed, validated.
    const res = await POST(
      req([file("c.txt", DOC_A + " Additional paragraph about reliability targets.")], {
        policy: "PUBLIC_RELEASE",
        runPipeline: "true",
        outputTypes: JSON.stringify(["EXECUTIVE_SUMMARY"]),
      })
    );
    const body = await res.json();
    expect(body.summary.pipelined).toBe(1);
    const item = body.results[0];
    expect(item.transformations).toBe(1);
    const tx = await db.transformation.findFirst({ where: { documentId: item.documentId } });
    expect(tx?.outputContent).not.toContain("priya.nair@example.org");
    const doc = await db.document.findUnique({ where: { id: item.documentId } });
    expect(doc?.status).toBe("TRANSFORMED");
  }, 90_000);

  it("isolates failures — one bad file never sinks the batch", async () => {
    const res = await POST(req([file("empty.txt", "   "), file("ok.txt", DOC_B + " Extra sentence for uniqueness.")], {}));
    const body = await res.json();
    expect(body.summary.total).toBe(2);
    expect(body.summary.failed).toBe(1);
    expect(body.summary.ingested).toBe(1);
    expect(body.results.find((r: any) => r.filename === "empty.txt").status).toBe("failed");
  }, 90_000);

  it("rejects oversized batches and unknown policies", async () => {
    const many = Array.from({ length: 21 }, (_, i) => file(`f${i}.txt`, "hello"));
    const tooMany = await POST(req(many, {}));
    expect(tooMany.status).toBe(400);
    const badPolicy = await POST(req([file("x.txt", DOC_B)], { policy: "NOPE" }));
    expect(badPolicy.status).toBe(400);
  }, 90_000);
});
