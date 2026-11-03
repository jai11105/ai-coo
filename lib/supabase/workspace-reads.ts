import { supabase } from "./client";
import { formatDbError } from "./businesses";
import { TXN_FIELDS, TXN_ITEM_FIELDS } from "./workspace";
import type { LiveBusinessSettings, LiveCategory, LiveProfile, LiveTransaction, LiveTransactionItem } from "./workspace";

/** Live profile for the signed-in user (RLS: auth.uid() = id). */
export async function fetchMyProfile(userId: string): Promise<LiveProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id,display_name,avatar_url,preferred_locale")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchMyProfile] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return (data as LiveProfile | null) ?? null;
}

/** Live settings for the active business (member SELECT policy).
 * Live schema has NO `is_gst_registered` column (42703) — do NOT select it.
 * Only business_id + tax_jurisdiction_code are read; GST UI renders "unknown"
 * rather than a fabricated true/false. No DB changes. */
export async function fetchBusinessSettings(businessId: string): Promise<LiveBusinessSettings | null> {
  const { data, error } = await supabase
    .from("business_settings")
    .select("business_id,tax_jurisdiction_code")
    .eq("business_id", businessId)
    .maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchBusinessSettings] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return (data as LiveBusinessSettings | null) ?? null;
}

/** Live categories for the active business (member SELECT, active only). */
export async function fetchCategories(businessId: string): Promise<LiveCategory[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id,business_id,transaction_type,name,parent_id,is_active")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchCategories] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return ((data ?? []) as LiveCategory[]).filter((c) => c.is_active);
}

/** Live transactions for the active business (non-deleted, newest first). */
export async function fetchTransactions(businessId: string): Promise<LiveTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select(TXN_FIELDS)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(500);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchTransactions] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return (data ?? []) as LiveTransaction[];
}

/** Live line-items for the active business (member SELECT, newest transaction first).
 * Used live-only for item-name suggestions; NO products table exists. */
export async function fetchTransactionItems(businessId: string): Promise<LiveTransactionItem[]> {
  const { data, error } = await supabase
    .from("transaction_items")
    .select(TXN_ITEM_FIELDS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchTransactionItems] Supabase error:", error);
    throw new Error(formatDbError(error));
  }
  return (data ?? []) as LiveTransactionItem[];
}