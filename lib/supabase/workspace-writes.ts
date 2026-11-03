// Live writes for the active business (Phase 4). Existing INSERT/ALL
// policies only; no schema/RLS/trigger changes. NO DB changes.
//
// Live-schema notes (verified against browser PGRST204, do NOT alter DB):
// - transactions has NO `reference_number` (PGRST204) — never send/select it.
// - business_settings has NO `is_gst_registered` (42703) — never send/select it.
// - transaction_items has NO `line_subtotal_minor` / `line_discount_minor` /
//   `line_tax_minor` (PGRST204) — never send/select them. Only
//   `line_total_minor` persists per-line totals; discount/tax live on the
//   header (0 for manual saves). Item names persist per-transaction via
//   transaction_items.item_name only; NO `products` table exists.

import { supabase } from "./client";
import { formatDbError } from "./businesses";
import { TXN_FIELDS } from "./workspace";
import type { LiveCategory, LiveTransaction, LiveTxnType } from "./workspace";

export interface CreateLiveTransactionInput {
  transaction_type: LiveTxnType;
  transaction_date: string;
  description?: string | null;
  category_id?: string | null;
  counterparty_name?: string | null;
  payment_method?: string | null;
  currency_code: string;
  total_minor: number;
  buying_cost_total_minor?: number | null;
  // Draft line-item (persisted via transaction_items.item_name on save).
  // No product-master write: product_id stays NULL.
  item_name?: string | null;
  quantity?: number | null;
  unit_selling_price_minor?: number | null;
  unit_buying_cost_minor?: number | null;
}

/** Delete a just-created transaction header (cleanup after line failure).
 * Used only for the header created in this same save call (by id +
 * business) so a retry cannot duplicate it. Referenced by
 * createLiveTransaction below; never touches other user records. */
export async function deleteLiveTransactionHeader(
  businessId: string,
  transactionId: string
): Promise<void> {
  const { error } = await supabase
    .from("transactions")
    .delete()
    .eq("id", transactionId)
    .eq("business_id", businessId);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[deleteLiveTransactionHeader] Supabase error:", error);
    throw new Error(
      `${formatDbError(error)} | note=header cleanup failed for ${transactionId}; retry may duplicate — report this id`
    );
  }
}

/** Insert a live transaction (owner/admin/editor via existing policy).
 *
 * Atomicity: the header is inserted first (no DB-side transaction support
 * from browser code), then the line item. If the line insert fails, the
 * just-created header is deleted before throwing, so the caller never
 * reports success and a retry cannot create a duplicate header. Expense
 * saves are header-only by data model (no item_name drafted); sale and
 * purchase saves persist exactly one line via existing columns only.
 */
export async function createLiveTransaction(
  businessId: string,
  input: CreateLiveTransactionInput
): Promise<LiveTransaction> {
  const payload = {
    business_id: businessId,
    transaction_type: input.transaction_type,
    transaction_date: input.transaction_date,
    description: input.description ?? null,
    category_id: input.category_id ?? null,
    counterparty_name: input.counterparty_name ?? null,
    payment_method: input.payment_method ?? null,
    currency_code: input.currency_code,
    subtotal_minor: input.total_minor,
    discount_minor: 0,
    tax_total_minor: 0,
    total_minor: input.total_minor,
    buying_cost_total_minor:
      input.transaction_type === "sale" ? input.buying_cost_total_minor ?? null : null,
    gross_profit_minor:
      input.transaction_type === "sale" && input.buying_cost_total_minor != null
        ? input.total_minor - input.buying_cost_total_minor
        : null,
    status: "confirmed",
    source: "manual",
  };
  const { data, error } = await supabase
    .from("transactions")
    .insert(payload)
    .select(TXN_FIELDS)
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[createLiveTransaction] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  const created = data as LiveTransaction;

  // Persist the draft line-item for sale/purchase via existing columns only.
  // Expense is header-only: Log Entry never drafts an item_name for it, so
  // no line row is attempted. product_id stays NULL (no products table).
  // Quantity is numeric(18,4): fractional quantities preserved (no Math.round).
  const itemName = (input.item_name ?? "").trim();
  if (itemName) {
    const qty = input.quantity ?? null;
    const { error: itemError } = await supabase.from("transaction_items").insert({
      transaction_id: created.id,
      business_id: businessId,
      line_number: 1,
      item_name: itemName,
      quantity: qty,
      unit: null,
      unit_selling_price_minor: input.unit_selling_price_minor ?? null,
      unit_buying_cost_minor: input.unit_buying_cost_minor ?? null,
      line_total_minor: input.total_minor,
    });
    if (itemError) {
      // eslint-disable-next-line no-console
      console.error("[createLiveTransaction] item insert error:", itemError);
      // Roll back the header from THIS save so no partial header-only row
      // remains and a retry cannot duplicate it. Never report success here.
      try {
        await deleteLiveTransactionHeader(businessId, created.id);
      } catch (cleanupError) {
        throw new Error(
          `${formatDbError(itemError)} | note=line-item write failed AND header cleanup failed (header ${created.id} may remain; report this id before retrying)`
        );
      }
      throw new Error(
        `${formatDbError(itemError)} | note=save rolled back (no header kept); fix the line item and retry`
      );
    }
  }
  return created;
}

/** Insert a live category (owner/admin/editor via existing policy). */
export async function createLiveCategory(
  businessId: string,
  transaction_type: LiveTxnType,
  name: string
): Promise<LiveCategory> {
  const clean = name.trim();
  const { data, error } = await supabase
    .from("categories")
    .insert({ business_id: businessId, transaction_type, name: clean })
    .select("id,business_id,transaction_type,name,parent_id,is_active")
    .single();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[createLiveCategory] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return data as LiveCategory;
}
