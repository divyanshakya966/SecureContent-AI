import { describe, it, expect } from "vitest";
import { parseDocument } from "@/lib/parsers";

describe("Document parsers", () => {
  it("parses plain text", async () => {
    const p = await parseDocument({ filename: "note.txt", mimeType: "text/plain", buffer: Buffer.from("hello world\n\nsecond paragraph") });
    expect(p.text).toContain("hello");
    expect(p.wordCount).toBeGreaterThan(0);
    expect(p.pages).toBeGreaterThan(0);
  });
  it("rejects oversized files", async () => {
    const big = Buffer.alloc(11 * 1024 * 1024, "a");
    await expect(parseDocument({ filename: "big.txt", mimeType: "text/plain", buffer: big })).rejects.toThrow(/too large/i);
  });
  it("handles image placeholder", async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG magic
    const p = await parseDocument({ filename: "scan.png", mimeType: "image/png", buffer: buf });
    expect(p.text).toMatch(/Image content placeholder/i);
    expect(p.warnings.length).toBeGreaterThan(0);
  });
  it("DOCX parsing tolerates truncated input (warns but does not throw)", async () => {
    const p = await parseDocument({ filename: "doc.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: Buffer.from("not a real docx") });
    // Either texts is empty and warns, or heuristic extracts something — never throws
    expect(typeof p.text).toBe("string");
    expect(p.warnings.length).toBeGreaterThan(0);
  });
  it("computes sha256 and charCount", async () => {
    const buf = Buffer.from("deterministic content");
    const p = await parseDocument({ filename: "a.txt", mimeType: "text/plain", buffer: buf });
    expect(p.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(p.charCount).toBe(buf.toString("utf8").length);
  });
});
