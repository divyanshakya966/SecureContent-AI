import { NextResponse } from "next/server";
import { SAMPLE_DOCUMENTS } from "@/lib/security";
import { checkRateLimit, rateLimitKey, rateLimitHeaders } from "@/lib/validation/rateLimit";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const rl = checkRateLimit(rateLimitKey(req as unknown as Request, "GET /api/v1/samples"), { max: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: rateLimitHeaders(rl, 60) });
  }
  return NextResponse.json({ samples: SAMPLE_DOCUMENTS }, { headers: { ...rateLimitHeaders(rl, 60), "Cache-Control": "public, max-age=60" } });
}
