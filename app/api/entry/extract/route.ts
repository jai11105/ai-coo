import { NextResponse } from "next/server";
import { extractWithContributor } from "@/lib/server/meta-extract";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/entry/extract — transcript → structured VoiceDraft.
 * Request: { transcript: string }
 * Calls Muse Spark Contributor (META_EXTRACTION_MODEL_ID) via Meta API
 * server-side (Bearer META_API_KEY); credentials never reach the browser.
 * Returns { data: { draft } }.
 * The draft is for review/edit only — this route never writes to Supabase.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { transcript?: unknown } | null;
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    if (!transcript) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Transcript is required." } },
        { status: 400 }
      );
    }
    if (transcript.length > 4000) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Transcript is too long. Please record a shorter entry." } },
        { status: 400 }
      );
    }
    const draft = await extractWithContributor(transcript);
    return NextResponse.json({
      data: { draft },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed.";
    const status = /not configured/i.test(message) ? 503 : 502;
    return NextResponse.json({ error: { code: "EXTRACT_FAILED", message } }, { status });
  }
}
