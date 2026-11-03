// Evidence contract — deterministic facts sent to AI models.
// Verified facts vs interpretations vs recommendations are distinguished.
// AI must never invent evidence; all numbers come from lib/analytics.ts.

export type EvidenceSource = "deterministic" | "analytical" | "assumption" | "missing";

export interface EvidenceItem {
  id: string; // e.g. "sales.total.this_month"
  metric: string; // e.g. "total_sales"
  label: string; // owner-friendly, e.g. "Total sales"
  valueMinor?: number | null; // money in minor units
  value?: number | string | null; // non-money or display value
  unit?: string; // e.g. "INR", "count", "%"
  display: string; // ready-to-show string, e.g. "₹48,250.00"
  timeframe: { start: string; end: string; preset: string };
  businessScope: { businessId: string; businessName: string; currency: string; timezone: string };
  source: EvidenceSource;
  calculation: string; // e.g. "sum(transactions.sale.total_minor) filtered 2026-10-01..2026-10-31"
  completeness: string; // e.g. "8 transactions" or "no data in range"
  dimensions?: Record<string, string>;
  // Slice 3: comparison provenance. Present on comparison rows (both periods,
  // absolute diff, % only when mathematically valid). Absent on single-period
  // rows — the model must not invent a comparison from a single value.
  comparison?: {
    prevStart: string;
    prevEnd: string;
    currentMinor?: number | null;
    previousMinor?: number | null;
    diffMinor?: number | null;
    /** Null = previous was zero/empty ("new"). Never a fabricated +100%. */
    pct: number | null;
  };
}

export interface EvidencePackage {
  packageId: string;
  question: string;
  intent: string;
  timeframe: { start: string; end: string; preset: string };
  items: EvidenceItem[];
  warnings: string[];
  generatedAt: string;
}

export function evidenceSummary(pkg: EvidencePackage): string {
  return pkg.items.map((i) => `${i.label}: ${i.display} (${i.timeframe.start}→${i.timeframe.end})`).join("\n");
}
