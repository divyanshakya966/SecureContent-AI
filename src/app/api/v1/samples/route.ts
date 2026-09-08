import { NextResponse } from "next/server";
import { SAMPLE_DOCUMENTS } from "@/lib/security";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ samples: SAMPLE_DOCUMENTS });
}
