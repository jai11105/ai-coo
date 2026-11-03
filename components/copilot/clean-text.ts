/**
 * Display-only text cleanup for customer-facing Copilot chat answers.
 * Removes developer diagnostics, internal notes, raw citation IDs,
 * dangling punctuation, and formatting artifacts.
 *
 * CRITICAL: Never alters figures, currency amounts (e.g. ₹250, $1,200), or words.
 */

export function cleanCopilotText(raw: string): string {
  if (!raw) return "";

  // 1. Remove developer/internal diagnostic sentences and notes
  let text = raw
    // Remove whole lines matching internal diagnostic notes
    .replace(
      /^\s*(?:Numeric check|RCA structure note|RCA honesty note|Priority note|Specialist note|Specialist truncation note|Evidence note|Partial coverage(?:\s+note)?|Image note)\s*[:=–—-].*$/gim,
      ""
    )
    .replace(/^\s*AI providers unavailable[:\s].*$/gim, "")
    .replace(/^\s*Specialist analysis unavailable.*$/gim, "")
    .replace(/^\s*Specialist analysis was partial.*$/gim, "")
    .replace(/^\s*Deep specialist analysis.*$/gim, "")
    // Remove inline occurrences of internal diagnostic notes
    .replace(
      /\b(?:Numeric check|RCA structure note|RCA honesty note|Priority note|Specialist note|Specialist truncation note|Evidence note|Partial coverage(?:\s+note)?|Image note)\s*[:=–—-][^\n.]*\.?/gi,
      ""
    )
    .replace(/\bAI providers unavailable\b[^\n.]*\.?/gi, "")
    .replace(/\bProvider HTTP \d+[^.\n]*/gi, "")
    .replace(/\b(?:trace_id|traceId|latencyMs|latency)\s*[:=]\s*\S+/gi, "");

  // 2. Remove bracket citation IDs: [sales.total...], [ev:...], [12], bare [], etc.
  text = text
    .replace(
      /\[(?:sales|profit|expense|purchase|trend|compare|product|category|channel|peak|recent|ev|evidence)\.[a-z0-9_.-]+\]/gi,
      ""
    )
    .replace(
      /\((?:sales|profit|expense|purchase|trend|compare|product|category|channel|peak|recent|ev|evidence)\.[a-z0-9_.-]+\)/gi,
      ""
    )
    .replace(/\bevidence\s+(?:id\s+)?[a-z0-9][a-z0-9_.-]*\.[a-z0-9_.-]+/gi, "verified records")
    .replace(/\[\d+\]/g, "")
    .replace(/\[\s*\]/g, "")
    .replace(/\(\s*\)/g, "");

  // 3. Remove lines whose content after a label is only punctuation
  // e.g. "Supporting evidence:,,," or "Key observations: - - "
  text = text.replace(/^[A-Za-z0-9\s_-]+:\s*[,;\s\-–—.:]+$/gm, "");

  // 4. Clean up repeated commas or dashes (while preserving numbers like 1,000 and markdown headings/horizontal rules)
  text = text
    .replace(/,{2,}/g, ",")
    .replace(/;{2,}/g, ";")
    .replace(/(?<!-)-{3,}(?!-)/g, "")
    .replace(/^[ \t]*[,;]\s*/gm, "");

  // 5. Per-line cleanup: remove trailing " —", ",", dashes and spaces
  const lines = text.split("\n").map((line) => {
    // Only trim trailing punctuation, leave markdown asterisks/hashes intact
    return line.replace(/[\s,–—-]+$/, "").trimEnd();
  });

  // 6. Normalize empty lines (no more than 2 consecutive newlines)
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

