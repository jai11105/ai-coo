export function formatMoney(minor: number, currency = "INR", locale = "en-IN"): string {
  const major = minor / 100;
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(major);
  } catch {
    return `${currency} ${(major).toFixed(2)}`;
  }
}

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

// Phase 1 mock boundary: all data below is static UI mock state.
// Future Phases 2+ will replace MockStore reads with Supabase queries
// via server actions / API routes defined in API_CONTRACTS.md.
export const MOCK_BOUNDARY_NOTE =
  "Phase 1 mock state — not connected to Supabase. Will be replaced by backend integration in Phase 2+.";
