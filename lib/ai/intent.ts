// Layer 1 — intent understanding (validated structured outputs).
// Rule: structured model-based resolution; NO new regex semantic parsing
// for intent/entities/timeframe/meaning. A tiny deterministic pre-router
// only separates obvious greetings/casual from business traffic; every
// message still goes through the AI API (Part 3: no hardcoded answers).

import type { CopilotIntent } from "./types";

export interface ResolvedIntent {
  intent: CopilotIntent;
  confidence: number; // 0..1
  needsSpecialist: boolean; // route to Baseten?
  needsTools: boolean; // needs deterministic evidence?
  timeframeHint: string | null; // e.g. "this_month", "last_month", null
  method: "heuristic" | "model";
}

const GREETINGS = new Set([
  "hi", "hello", "hey", "good morning", "good afternoon", "good evening",
  "namaste", "vanakkam", "how are you", "thank you", "thanks", "bye",
]);

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/[!.?,\s]+$/g, "").replace(/^[!.?,\s]+/g, "");
}

/** Deterministic pre-router ONLY for greetings/casual vs business split.
 *  Never produces answers; the model still generates every response. */
export function preRouteIntent(message: string): ResolvedIntent | null {
  const n = norm(message);
  if (!n) return null;
  if (GREETINGS.has(n) || /^(hi|hello|hey)\b.{0,20}$/.test(n)) {
    return { intent: n.includes("thank") ? "casual" : "greeting", confidence: 0.95, needsSpecialist: false, needsTools: false, timeframeHint: null, method: "heuristic" };
  }
  if (/^(thank|thanks|ok|okay|great|nice|good|bye|good ?(morning|afternoon|evening|night))[\s!.]*$/.test(n)) {
    return { intent: "casual", confidence: 0.9, needsSpecialist: false, needsTools: false, timeframeHint: null, method: "heuristic" };
  }
  if (/^(how are you|who are you|what can you do|help)[\s?!.]*$/.test(n)) {
    return { intent: "casual", confidence: 0.9, needsSpecialist: false, needsTools: false, timeframeHint: null, method: "heuristic" };
  }
  return null; // everything else → model-based resolution in the orchestrator
}

/** Heuristic hint for timeframe words (hint only — model resolves). */
export function timeframeHint(message: string): string | null {
  const n = norm(message);
  if (/\btoday\b/.test(n)) return "today";
  if (/\byesterday\b/.test(n)) return "yesterday";
  if (/\bthis week\b/.test(n)) return "this_week";
  if (/\blast week\b/.test(n)) return "last_week";
  if (/\bthis month\b/.test(n)) return "this_month";
  if (/\blast month\b/.test(n)) return "last_month";
  if (/\bthis year\b/.test(n)) return "this_year";
  if (/\blast year\b/.test(n)) return "last_year";
  return null;
}

/** Rolling-window hint for explicit day/week window requests.
 *  Hint only — the orchestrator resolves it into an exact Custom range.
 *  e.g. "sales for the last 30 days" -> { days: 30, label: "Last 30 Days" }.
 *  Accepts "last/past N days/weeks" AND bare "for N days" / "N days" /
 *  "N-day" phrasings (e.g. "What were my sales for 30 days?") so a 30-day
 *  question is never silently answered as This Month. */
export function rollingWindowHint(message: string): { days: number; label: string } | null {
  const n = (message || "").toLowerCase();
  let m = /\b(last|past)\s+(\d{1,3})\s*(days?|weeks?)\b/.exec(n);
  let num = 0;
  let unitRaw = "";
  if (m) {
    num = parseInt(m[2], 10);
    unitRaw = m[3];
  } else {
    const m2 = /\b(?:for\s+)?(\d{1,3})\s*-?\s*(days?|weeks?)\b/.exec(n);
    if (!m2) return null;
    num = parseInt(m2[1], 10);
    unitRaw = m2[2];
    // Bare "N days" without last/past/for only counts when the question is
    // explicitly about a day window (avoids hijacking dates like "2026").
    // Require the word day/week present (already matched) and a business noun
    // or an explicit window verb nearby.
    if (!/\b(last|past|for|previous|reports?|sales|expenses?|profit|revenue|summary|total|show|give|what)\b/.test(n)) return null;
  }
  if (!Number.isFinite(num) || num < 1) return null;
  const isWeek = unitRaw.startsWith("week");
  if (!isWeek && num > 365) return null;
  if (isWeek && num > 52) return null;
  const days = isWeek ? num * 7 : num;
  if (days < 1 || days > 365) return null;
  const unit = isWeek ? (num === 1 ? "Week" : "Weeks") : (num === 1 ? "Day" : "Days");
  return { days, label: `Last ${num} ${unit}` };
}

/** Specialist-analysis triggers (hint only — orchestrator decides). */
export function specialistHint(message: string): boolean {
  const n = norm(message);
  return /\b(why|root cause|recommend|should i|what should|peak hour|best time|what.?if|scenario|forecast|predict|compare|analysis|analyse|report|opportunit|weak|improve|action|priority|priorities)\b/.test(n);
}
