// Server-side transaction loader for Copilot evidence.
// Reads via service-role with explicit business scoping (tenant isolation).
// Maps to MockTransaction via the shared live-adapter (no new mapping).

import { createClient } from "@supabase/supabase-js";
import { groupItemsByTxn, liveToMockTransactions, withQuantities } from "@/lib/live-adapter";
import type { MockTransaction } from "@/lib/types";
import type { LiveTransaction, LiveTransactionItem } from "@/lib/supabase/workspace";
import { TXN_FIELDS, TXN_ITEM_FIELDS } from "@/lib/supabase/workspace";

export async function loadBusinessTransactions(
  businessId: string, currency: string, timezone: string,
): Promise<{ transactions: MockTransaction[]; dataVersion: string }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) return { transactions: [], dataVersion: "no-creds" };
  const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: txns } = await sb
    .from("transactions")
    .select(TXN_FIELDS)
    .eq("business_id", businessId)
    .is("deleted_at", null)
    .order("transaction_date", { ascending: false })
    .limit(500);
  const { data: items } = await sb
    .from("transaction_items")
    .select(TXN_ITEM_FIELDS)
    .eq("business_id", businessId)
    .order("created_at", { ascending: false })
    .limit(200);

  const liveTxns = ((txns ?? []) as unknown as LiveTransaction[]);
  const liveItems = ((items ?? []) as unknown as LiveTransactionItem[]);
  const categoryIds: string[] = [];
  for (const t of liveTxns) {
    if (t.category_id && categoryIds.indexOf(t.category_id) < 0) categoryIds.push(t.category_id);
  }
  let categoryById = new Map<string, string>();
  if (categoryIds.length > 0) {
    const { data: cats } = await sb.from("categories").select("id,name").in("id", categoryIds);
    categoryById = new Map(((cats ?? []) as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  }
  const mapped = liveToMockTransactions(liveTxns, categoryById, currency, timezone);
  const transactions = withQuantities(mapped, groupItemsByTxn(liveItems));
  const dataVersion = `${liveTxns.length}:${liveItems.length}:${(liveTxns[0] as { transaction_date?: string } | undefined)?.transaction_date ?? "empty"}`;
  return { transactions, dataVersion };
}
