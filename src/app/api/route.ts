import { NextResponse } from "next/server";
import { checkDatabaseHealth } from "@/lib/db";

export async function GET() {
  const db = await checkDatabaseHealth();
  const hasLlm = Boolean(process.env.GEMINI_API_KEY?.trim() || process.env.GROQ_API_KEY?.trim());
  return NextResponse.json({
    name: "SecureContent AI",
    status: db.ok ? "ok" : "degraded",
    version: "1.0.0",
    database: db.ok ? "connected" : "unavailable",
    dbLatencyMs: db.latencyMs,
    llm: hasLlm ? "configured" : "offline-mock",
    pipeline: "Scan → Sanitize → Transform → Validate (double-gate DLP)",
    timestamp: new Date().toISOString(),
  });
}