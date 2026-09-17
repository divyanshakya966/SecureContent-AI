import { NextRequest, NextResponse } from "next/server";
import { runFullPipeline, PipelineHttpError } from "@/lib/pipeline-run";
import type {
  OutputType,
  GenerationTone,
  GenerationLanguage,
  DetailLevel,
  CommunicationObjective,
  ContentStyle,
  SanitizeAction,
} from "@/types";
import { PipelineSchema, DocumentIdSchema, parseOr400 } from "@/lib/validation/schemas";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";
import { requireApiAuth } from "@/lib/auth";

export const runtime = "nodejs";

// Full auto pipeline (SSE): sanitize → transform → validate → release.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const _auth = requireApiAuth(req);
  if (_auth) return _auth;
  const { id } = await params;
  const idCheck = parseOr400(DocumentIdSchema, id);
  if (!idCheck.ok) return NextResponse.json({ error: idCheck.error }, { status: 400 });

  const rl = checkRateLimit(rateLimitKey(req, `POST /pipeline:${id}`), { max: 10, windowMs: 60_000 });
  if (!rl.allowed) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 10) });

  const body: unknown = await req.json().catch(() => ({}));
  const parsed = parseOr400(PipelineSchema, body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400, headers: rateLimitHeaders(rl, 10) });
  const {
    policy: policyName,
    outputType,
    outputTypes,
    findingActions,
    tone,
    language,
    detailLevel,
    objective,
    style,
    batchId: requestedBatchId,
  } = parsed.data as {
    policy: string;
    outputType: OutputType;
    outputTypes?: OutputType[];
    findingActions?: { id?: string; location?: string; type?: string; action: SanitizeAction }[];
    tone?: GenerationTone;
    language?: GenerationLanguage;
    detailLevel?: DetailLevel;
    objective?: CommunicationObjective;
    style?: ContentStyle;
    batchId?: string;
  };
  const requestedTypes: OutputType[] = outputTypes && outputTypes.length ? outputTypes : [outputType];
  if (requestedTypes.length > 8) {
    return NextResponse.json({ error: "Too many output types (max 8)" }, { status: 400, headers: rateLimitHeaders(rl, 10) });
  }
  const batchId = requestedTypes.length > 1 ? (requestedBatchId ?? crypto.randomUUID()) : (requestedBatchId ?? null);

  const headers = {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    ...rateLimitHeaders(rl, 10),
  };

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();

      const send = (event: string, data: Record<string, unknown> = {}) => {
        controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify({ event, ...data })}\n\n`));
      };
      // Heartbeats guard long batches against idle timeouts.
      const heartbeat = setInterval(() => {
        try { controller.enqueue(enc.encode(`: ping\n\n`)); } catch { /* closed */ }
      }, 15000);

      try {
        const result = await runFullPipeline({
          documentId: id,
          policyName,
          outputTypes: requestedTypes,
          params: { tone, language, detailLevel, objective, style },
          findingActions,
          batchId,
          onEvent: (e) => send(e.event, e as unknown as Record<string, unknown>),
        });
        if (result.blocked) {
          send("blocked", { blockReason: result.blockReason, actions: result.actions });
          return;
        }
        send("done", {
          document: result.document,
          transformations: result.transformations,
          residualRisk: result.residualRisk,
          batchId: result.batchId,
          errors: result.errors,
          dlpReasons: result.dlpReasons,
        });
      } catch (e: unknown) {
        console.error("[pipeline]", e);
        const status = e instanceof PipelineHttpError ? e.status : undefined;
        const message = e instanceof Error ? e.message : "Pipeline failed.";
        try {
          const enc2 = new TextEncoder();
          controller.enqueue(enc2.encode(`event: error\ndata: ${JSON.stringify({ event: "error", error: message, status })}\n\n`));
        } catch { /* stream already closed */ }
      } finally {
        clearInterval(heartbeat);
        try { controller.close(); } catch { /* already closed */ }
      }
    },
  });

  return new Response(stream, { headers });
}
