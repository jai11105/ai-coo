// Slice 5 — specialist output validation (pure, no network).
// Every specialist conclusion must trace to evidence or be marked assumption.
// Slice 6: recommendation memos additionally require evidence-cited
// priorities, qualified impact, and no guaranteed financial outcomes.

import type { EvidencePackage } from "./evidence";

export interface SpecialistValidation {
  ok: boolean;
  warnings: string[];
}

/** Validate specialist output before it reaches Standard. Never throws. */
export function validateSpecialistOutput(text: string, evidence: EvidencePackage | null): SpecialistValidation {
  const warnings: string[] = [];
  const t = (text || "").trim();
  if (!t) return { ok: false, warnings: ["Specialist returned empty output — rejected."] };
  if (!evidence || evidence.items.length === 0) {
    return { ok: false, warnings: ["Specialist output without evidence — rejected."] };
  }
  const norm = (s: string) => s.replace(/[₹$,\s]/g, "").toLowerCase();
  // Numeric trace check: strip thousands separators AND trailing ".00"/".0"
  // decimals so "Rs.10,695.00" in the memo matches "10695"/"1069500 cents" in
  // evidence, and minor-unit integers match their display forms. Verified
  // live: without decimal normalization every memo figure (10695 vs
  // 10695.00) was falsely flagged as unsupported.
  const canon = (s: string) => norm(s).replace(/\.0+$/, "");
  // Minor-unit integers in evidence (valueMinor, e.g. "1069500") decode to
  // their rupee display forms so memo figures like 10695/7236/3459 match.
  // Word-count planning notes ("~450 words", "~300 words") and model IDs
  // ("1026") are document structure, not financial claims — excluded.
  const evParts = evidence.items.map((i) => {
    const minorRaw = String(i.valueMinor ?? "");
    const rupee = /^\d+$/.test(minorRaw) ? String(Math.round(Number(minorRaw) / 100)) : "";
    return `${i.display} ${i.label} ${i.valueMinor ?? ""} ${i.value ?? ""} ${rupee}`;
  });
  const evNorm = canon(evParts.join(" | "));
  // Dates (YYYY-MM-DD, DD-MM-YYYY fragments) and section numbers ("6.",
  // "7.") are document structure, not financial claims — exclude them so a
  // reasoning-trace memo with planning notes isn't flagged for citing its
  // own outline. Only numbers >= 100 that look like money/quantities count.
  const numbers = t.match(/\d[\d,]*(?:\.\d+)?\s*(?:%|₹|rs\.?|inr|units?|txns?|transactions?)?/gi) || [];
  let unsupported = 0;
  for (const n of numbers.slice(0, 40)) {
    const raw = n.replace(/[^\d.]/g, "").replace(/^0+(?=\d)/, "");
    if (!raw) continue;
    // Skip date fragments (2026, 11, 01, 02, 30, 31) and small ordinals.
    if (/^(2026|20\d\d|0?[1-9]|1\d|2\d|3[01])$/.test(raw.replace(/\.0+$/, ""))) continue;
    // Skip word-count planning notes and model IDs, never financial claims.
    const ctxIdx = t.indexOf(n);
    const ctx = ctxIdx >= 0 ? t.slice(Math.max(0, ctxIdx - 12), ctxIdx + n.length + 8).toLowerCase() : "";
    if (/words?/.test(ctx)) continue;
    if (/muse spark open|model|specialist \(/.test(ctx) && /1026/.test(raw)) continue;
    const digits = canon(raw);
    if (!digits || Number(digits) < 500) continue;
    // Also accept the paise/minor-unit form (×100) present in evidence.
    const minor = /^\d+(\.0+)?$/.test(digits) ? String(Math.round(Number(digits) * 100)) : "";
    if (!evNorm.includes(digits) && !(minor && evNorm.includes(minor))) unsupported += 1;
  }
  if (unsupported > 0) {
    warnings.push(`Specialist cites ${unsupported} numeric value(s) not traceable to evidence — verify before presenting as fact.`);
  }
  const nullPct = evidence.items.filter((i) => i.comparison && i.comparison.pct == null);
  if (nullPct.length > 0 && /(^|\s)\+?\d+(\.\d+)?\s*%/.test(t)) {
    warnings.push(`% change is unavailable for ${nullPct.length} comparison row(s) (previous period was zero/empty — report "new").`);
  }
  if (/\b(caused by|due to|because of|root cause is|driven by)\b/i.test(t)
    && !/contributing factor|likely|possible|evidence suggests|consistent with|limitation|additional data/i.test(t)) {
    warnings.push("Specialist states a causal claim without hedging or evidence limits — treat as hypothesis, not verified fact.");
  }
  // Slice 6: priority-memo honesty. Only applies when the memo reads as a
  // recommendation list (avoids false positives on RCA/scenario memos).
  const looksPriority = /priorit|ranked candidates|expected impact|next step/i.test(t);
  if (looksPriority) {
    const validIds = new Set((evidence?.items ?? []).map((i) => i.id));
    const matches = t.match(/[a-z0-9][a-z0-9_.-]*\.[a-z0-9_.-]+/gi) || [];
    let cited = 0;
    for (const m of matches) {
      if (validIds.has(m)) cited += 1;
    }
    if (cited === 0) {
      warnings.push("Specialist priority memo cites no verified evidence IDs — priorities lack traceable support.");
    }
    if (!/verified|calculated|estimate|qualitative|depends on|not guaranteed/i.test(t)) {
      warnings.push("Specialist priority memo does not qualify expected impact (verified/calculated/estimate/qualitative).");
    }
    if (/guarantee[sd]? will (increase|save|earn)|will definitely .*₹|assured .*profit/i.test(t)) {
      warnings.push("Specialist memo guarantees a financial outcome — present it as a possibility, not a verified result.");
    }
    if (/\burgent\b|\bcritical\b/i.test(t) && !/high-priority|severity|why.*urgent|urgency.*because/i.test(t)) {
      warnings.push("Specialist claims urgency without tying it to evidence severity — verify before presenting as urgent.");
    }
  }
  return { ok: warnings.length === 0, warnings };
}
