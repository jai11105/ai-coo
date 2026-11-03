// Maps live Supabase transactions to the existing MockTransaction shape
// so Dashboard / Ledger / Copilot evidence reuse unchanged analytics + UI.
// No mock values: empty DB yields empty arrays and zero totals.
// Live schema has NO `reference_number` — reference labels derive from id.
// Quantities/revenue come ONLY from transaction_items when the caller joins
// them (see withQuantities below). Without joined line items, qty stays
// undefined so Top Products reports "qty unknown" instead of inventing 1.

import type { MockTransaction, TransactionType } from "./types";
import type { LiveTransaction, LiveTransactionItem } from "./supabase/workspace";
import { dayInTimezone } from "./analytics";

const TYPE_MAP: Record<string, TransactionType> = {
  sale: "sale",
  purchase: "purchase",
  expense: "expense",
};

function toLocalInput(dateIso: string, timezone?: string | null): string {
  const raw = (dateIso ?? "").trim();
  // Date-only live values ("2026-11-01") stay verbatim at local midnight —
  // never shifted through the UTC Date constructor to another calendar day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T00:00`;
  const day = dayInTimezone(raw, timezone);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // Datetime without zone ("2026-11-01T10:00...") is already
    // business-local — keep the day, preserve/zero the clock.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
    return `${day}T00:00`;
  }
  // Zoned stamps: keep the business-local calendar day + wall-clock time so
  // filtering by dayInTimezone(day) and display stay in sync.
  try {
    const tz = (timezone ?? "").trim() || "UTC";
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
  } catch {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}

export function liveToMockTransactions(
  rows: LiveTransaction[],
  categoryById: Map<string, string>,
  fallbackCurrency: string,
  timezone?: string | null
): MockTransaction[] {
  return rows.map((r) => {
    const type: TransactionType = TYPE_MAP[r.transaction_type] ?? "expense";
    // category_id wins when present; otherwise try to split "product · category"
    // descriptions written by Log Entry; else raw description; else General.
    const mapped = r.category_id ? categoryById.get(r.category_id) : undefined;
    const rawDesc = (r.description ?? "").trim();
    let category = mapped || "General";
    let product: string | undefined;
    if (mapped) {
      // Description format is "product · category" — recover the product part
      // so Ledger/Top-products show the item name, not just the category.
      if (rawDesc) {
        const sep = rawDesc.lastIndexOf(" · ");
        if (sep > 0) {
          const maybeProd = rawDesc.slice(0, sep).trim();
          const maybeCat = rawDesc.slice(sep + 3).trim();
          if (maybeProd) product = maybeProd;
          // Trust mapped category over the embedded suffix.
          if (!maybeCat) category = rawDesc;
        } else if (rawDesc !== mapped) {
          product = rawDesc;
        }
      }
    } else if (rawDesc) {
      const sep = rawDesc.lastIndexOf(" · ");
      if (sep > 0) {
        product = rawDesc.slice(0, sep).trim() || undefined;
        category = rawDesc.slice(sep + 3).trim() || "General";
      } else {
        category = rawDesc;
      }
    }
    const base = {
      id: r.id,
      type,
      date: toLocalInput(r.transaction_date, timezone),
      category,
      party: r.counterparty_name || "—",
      amountMinor: r.total_minor,
      currency: r.currency_code || fallbackCurrency,
      paymentMethod: r.payment_method || "—",
      // Slice 3: live `transactions.channel` passthrough (trimmed, no default).
      // Absent/blank stays undefined so Copilot reports missing data honestly
      // instead of inventing a channel. Never falls back to payment method.
      channel: (r.channel ?? "").trim() || undefined,
      // No reference_number column live: stable short id-derived label only.
      // qty/unitPrice deliberately OMITTED here: joined in via
      // withQuantities() from transaction_items ONLY. Never default to 1.
      reference: `TXN-${r.id.slice(0, 8).toUpperCase()}`,
      notes: r.description ?? undefined,
    };
    if (type === "sale") {
      return {
        ...base,
        product,
        buyingCostTotalMinor: r.buying_cost_total_minor ?? 0,
      };
    }
    return { ...base, product };
  });
}

export function currencyFor(currencyCode: string | undefined, fallback: string): string {
  return currencyCode || fallback || "INR";
}

/** Join live line-items onto mapped transactions. Quantity, unit price and
 * line-item revenue come ONLY from transaction_items.quantity /
 * line_total_minor. Sales with no line rows keep qty undefined (Top Products
 * shows "qty unknown") and revenue falls back to the header total_minor.
 * Nothing here invents quantities or modifies historical records. */
export function withQuantities(
  txns: MockTransaction[],
  itemsByTxnId: Map<string, LiveTransactionItem[]>
): MockTransaction[] {
  return txns.map((t) => {
    const lines = itemsByTxnId.get(t.id) ?? [];
    if (lines.length === 0) return t;
    const sorted = [...lines].sort((a, b) => a.line_number - b.line_number);
    const first = sorted[0];
    const qtyRaw = first.quantity == null ? null : Number(first.quantity);
    const qty = qtyRaw == null || !isFinite(qtyRaw) ? undefined : qtyRaw;
    const lineRevenue = sorted.reduce(
      (s, l) => s + (typeof l.line_total_minor === "number" ? l.line_total_minor : 0),
      0
    );
    const firstName = (first.item_name ?? "").trim();
    const product =
      sorted.length === 1
        ? firstName || t.product
        : `${firstName || t.product || "Mixed items"} ×${sorted.length}`;
    return {
      ...t,
      product,
      qty,
      unitPriceMinor:
        first.unit_selling_price_minor ??
        (qty ? Math.round(lineRevenue / qty) : t.unitPriceMinor),
      // Revenue prefers summed line totals (actual transaction_items rows);
      // header total_minor is the fallback when line totals are absent/zero.
      amountMinor: lineRevenue > 0 ? lineRevenue : t.amountMinor,
    };
  });
}

/** Group line-items by transaction_id for withQuantities(). */
export function groupItemsByTxn(items: LiveTransactionItem[]): Map<string, LiveTransactionItem[]> {
  const map = new Map<string, LiveTransactionItem[]>();
  for (const it of items) {
    const list = map.get(it.transaction_id) ?? [];
    list.push(it);
    map.set(it.transaction_id, list);
  }
  return map;
}
