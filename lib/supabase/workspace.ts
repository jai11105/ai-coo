// Live Supabase workspace access (Phase 4). Browser-safe: shared
// publishable-key client + signed-in JWT, RLS applies. No service-role key.
// No schema/RLS/trigger changes here — reads/writes use existing tables.
//
// Phase 4 verified live-schema notes (NO DB changes):
// - public.transactions has NO `reference_number` column in the live schema
//   (PGRST204). All reads/writes avoid it; UI reference labels derive from id.
// - public.business_settings has NO `is_gst_registered` column in the live
//   schema (42703). Reads/writes avoid it.
// - public.transaction_items has `item_name` + nullable `product_id`.
//   There is NO verified `products` table — no product-catalogue persistence.
// - Every business-data query is scoped to the active business_id via RLS.

import { supabase } from "./client";
import { formatDbError } from "./businesses";

export type LiveTxnType = "sale" | "purchase" | "expense";

export interface LiveTransaction {
  id: string;
  business_id: string;
  transaction_type: LiveTxnType;
  transaction_date: string;
  description: string | null;
  category_id: string | null;
  counterparty_name: string | null;
  channel: string | null;
  payment_method: string | null;
  currency_code: string;
  subtotal_minor: number;
  discount_minor: number;
  tax_total_minor: number;
  total_minor: number;
  buying_cost_total_minor: number | null;
  gross_profit_minor: number | null;
  status: string;
  source: string;
}

export interface LiveTransactionItem {
  id: string;
  transaction_id: string;
  business_id: string;
  line_number: number;
  item_name: string;
  quantity: number | null;
  unit: string | null;
  unit_selling_price_minor: number | null;
  unit_buying_cost_minor: number | null;
  // Live table has NO `line_subtotal_minor` (PGRST204 on insert/select) —
  // never send/select it. Line totals persist via `line_total_minor` only.
  // Line discount/tax are not persisted per-line live (header discount/tax
  // stay 0); do not invent columns.
  line_total_minor: number;
}

export interface LiveCategory {
  id: string;
  business_id: string;
  transaction_type: LiveTxnType;
  name: string;
  parent_id: string | null;
  is_active: boolean;
}

export interface LiveProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  preferred_locale: string;
}

export interface LiveBusinessSettings {
  business_id: string;
  tax_jurisdiction_code: string | null;
}

// Live transactions SELECT — must match the live schema exactly.
// Deliberately omits `reference_number` (absent live) and write-only
// audit columns (created_by/updated_by/deleted_at/version/timestamps)
// that are not needed for dashboard/ledger display.
export const TXN_FIELDS =
  "id,business_id,transaction_type,transaction_date,description,category_id,counterparty_name,channel,payment_method,currency_code,subtotal_minor,discount_minor,tax_total_minor,total_minor,buying_cost_total_minor,gross_profit_minor,status,source";

// Live transaction_items SELECT — must match the live schema exactly.
// Deliberately omits `line_subtotal_minor`, `line_discount_minor` and
// `line_tax_minor` (PGRST204 on the live table). Only `line_total_minor`
// persists per-line totals; discount/tax live on the header (0 for now).
export const TXN_ITEM_FIELDS =
  "id,transaction_id,business_id,line_number,item_name,quantity,unit,unit_selling_price_minor,unit_buying_cost_minor,line_total_minor";

