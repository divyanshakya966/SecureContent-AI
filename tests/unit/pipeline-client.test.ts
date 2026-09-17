import { describe, it, expect, vi, afterEach } from "vitest";
import { api } from "@/lib/api-client";

// Regression test: the pipeline endpoint streams `text/event-stream`, not JSON.
// The client must check HTTP status without consuming the body as JSON
// (previously `res.json()` on the stream threw
// "JSON.parse: unexpected character at line 1 column 1").

function sseResponse(frames: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(c) {
      for (const f of frames) c.enqueue(enc.encode(f));
      c.close();
    },
  });
  return new Response(stream, {
    status,
    headers: { "Content-Type": status === 200 ? "text/event-stream" : "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Pipeline SSE client", () => {
  it("streams events through to the terminal done payload", async () => {
    const frames = [
      'event: sanitize-start\ndata: {"event":"sanitize-start","policy":"PUBLIC_RELEASE"}\n\n',
      'event: sanitize-done\ndata: {"event":"sanitize-done","actions":2,"residualRisk":5}\n\n',
      'event: transform-start\ndata: {"event":"transform-start","index":1,"total":1,"outputType":"FAQ"}\n\n',
      ': ping\n\n',
      'event: transform-done\ndata: {"event":"transform-done","index":1,"total":1,"outputType":"FAQ","outputDlp":"PASS"}\n\n',
      'event: done\ndata: {"event":"done","transformations":[],"residualRisk":5,"batchId":null,"errors":[],"dlpReasons":[]}\n\n',
    ];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(frames)));
    const seen: string[] = [];
    const done = await api.runPipeline(
      "doc123",
      { policy: "PUBLIC_RELEASE", outputTypes: ["FAQ"] },
      (m) => seen.push(m.event)
    );
    expect(seen).toEqual(["sanitize-start", "sanitize-done", "transform-start", "transform-done", "done"]);
    expect(done.residualRisk).toBe(5);
    expect(done.errors).toEqual([]);
  });

  it("surfaces HTTP error payloads without parsing the body as a stream", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Rate limited" }), { status: 429 }))
    );
    await expect(api.runPipeline("doc123", {})).rejects.toThrow("Rate limited");
  });

  it("surfaces blocked terminal events as errors", async () => {
    const frames = ['event: blocked\ndata: {"event":"blocked","blockReason":"No usable prose."}\n\n'];
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(frames)));
    await expect(api.runPipeline("doc123", {})).rejects.toThrow("No usable prose");
  });
});
