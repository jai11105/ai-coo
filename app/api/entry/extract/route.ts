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
function isValidCalendarDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { transcript?: unknown; today?: unknown } | null;
    const transcript = typeof body?.transcript === "string" ? body.transcript.trim() : "";
    const todayRaw = typeof body?.today === "string" ? body.today.trim() : "";
    const today = isValidCalendarDate(todayRaw) ? todayRaw : undefined;
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
    const draft = await extractWithContributor(transcript, today);
    let defaulted = false;
    if (!draft.date && today) {
      draft.date = today;
      draft.uncertain_fields = draft.uncertain_fields.filter((f) => f !== "date");
      defaulted = true;
    }
    console.info("[extract-date]", { clientToday: today, extractedDate: draft.date, defaulted });
    return NextResponse.json({
      data: { draft },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Extraction failed.";
    const meta = (e as { code?: unknown; upstreamStatus?: unknown } | null) ?? {};
    const code = typeof meta.code === "string" ? meta.code : "EXTRACT_FAILED";
    let status = /not configured/i.test(message) ? 503 : 502;
    // Forward safe upstream provider status (no keys/secrets) so the UI can
    // distinguish auth/quota/model errors from empty content.
    if (typeof meta.upstreamStatus === "number" && meta.upstreamStatus >= 400 && meta.upstreamStatus <= 599) {
      status = meta.upstreamStatus;
    } else if (/timed out|Could not reach/i.test(message)) {
      status = 504;
    }
    return NextResponse.json({ error: { code, message } }, { status });
  }
}
