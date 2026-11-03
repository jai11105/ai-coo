"use client";

import { useMemo, useState } from "react";
import { useBusiness } from "@/components/business-context";
import { useMockStore } from "@/components/providers";
import { useWorkspace } from "@/components/workspace-context";
import { liveToMockTransactions } from "@/lib/live-adapter";
import type { TransactionType } from "@/lib/types";
import { cx, formatMoney } from "@/lib/utils";

type Filter = "all" | TransactionType;

function fmtDate(iso: string): string {
  const [d, t] = iso.split("T");
  return t ? `${d} ${t}` : d;
}

export default function LedgerPage() {
  const { transactions: mockTxns, profile: mockProfile } = useMockStore();
  const { userId, activeBusiness, activeBusinessId } = useBusiness();
  const { transactions: liveTxns, categories, loading, error, refresh } = useWorkspace();

  const isLive = Boolean(userId && activeBusinessId);
  const transactions = useMemo(() => {
    if (!isLive) return mockTxns;
    const categoryById = new Map(categories.map((c) => [c.id, c.name]));
    return liveToMockTransactions(liveTxns, categoryById, activeBusiness?.currency_code ?? "INR", activeBusiness?.timezone ?? "UTC");
  }, [isLive, mockTxns, liveTxns, categories, activeBusiness?.currency_code, activeBusiness?.timezone]);

  const profile = useMemo(
    () =>
      isLive && activeBusiness
        ? { ...mockProfile, name: activeBusiness.name, currencyCode: activeBusiness.currency_code }
        : mockProfile,
    [isLive, activeBusiness, mockProfile]
  );

  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const rows = useMemo(
    () =>
      transactions.filter((t) => {
        if (filter !== "all" && t.type !== filter) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return [t.party, t.category, t.product ?? "", t.reference, t.notes ?? ""].join(" ").toLowerCase().includes(q);
      }),
    [transactions, filter, query]
  );
  const total = rows.reduce((s, r) => s + r.amountMinor, 0);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-[#0a2540] to-blue-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-950/10 border border-white/10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden="true" />
        
        <div className="relative">
          <span className="chip bg-white/15 text-white backdrop-blur-md border border-white/20">
            {profile.name} · {isLive ? "Live Ledger" : "Demo Dataset (Mock)"}
          </span>
          <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Data / Ledger
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm font-medium text-blue-100/80">
            {transactions.length} total persisted transaction records in this workspace.
          </p>

          {isLive && loading && (
            <p className="mt-3 text-xs sm:text-sm font-medium text-white/80 animate-pulse">
              Loading live ledger…
            </p>
          )}
          {isLive && error && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <p className="rounded-xl bg-red-500/30 border border-red-400/40 px-3.5 py-2 text-xs sm:text-sm font-medium text-white backdrop-blur-sm" role="alert">
                {error}
              </p>
              <button
                className="rounded-xl bg-white/20 px-3.5 py-2 text-xs font-bold text-white hover:bg-white/30 transition-colors shadow-sm"
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </div>
          )}
          {isLive && !loading && !error && transactions.length === 0 && (
            <p className="mt-3 text-xs sm:text-sm text-white/90">
              No ledger entries yet — use Log Entry to record your first transaction.
            </p>
          )}
        </div>
      </div>

      {/* Filter and Search Bar Card */}
      <div className="card flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-slate-100/90 p-1.5 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60">
          {(["all", "sale", "purchase", "expense"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                "rounded-xl px-4 py-2 text-xs sm:text-sm font-bold capitalize transition-all duration-150",
                filter === f
                  ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              )}
            >
              {f === "all" ? "All Activity" : `${f}s`}
            </button>
          ))}
        </div>
        <div className="relative sm:w-72">
          <input
            className="input pl-9 font-medium"
            placeholder="Search party, product, ref…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search ledger"
          />
          <span className="pointer-events-none absolute left-3 top-3 text-slate-400 text-sm">🔍</span>
        </div>
      </div>

      {/* Transaction Table Card */}
      <div className="card tbl-scroll !p-0 overflow-x-auto">
        <div className="min-w-[700px]">
          <div className="hidden grid-cols-6 gap-3 border-b border-slate-200/80 bg-slate-50/70 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 md:grid">
            <span>Date &amp; Time</span>
            <span>Type</span>
            <span>Party / Details</span>
            <span>Method</span>
            <span>Reference</span>
            <span className="text-right">Amount</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {rows.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-2 gap-2 px-5 py-3.5 text-sm transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 md:grid-cols-6 md:items-center md:gap-3"
              >
                <span className="num text-xs font-medium text-slate-500 dark:text-slate-400">
                  {fmtDate(t.date)}
                </span>
                <span>
                  <span
                    className={cx(
                      "chip font-bold",
                      t.type === "sale"
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60"
                        : t.type === "purchase"
                          ? "bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/60"
                          : "bg-amber-50 text-amber-800 border border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60"
                    )}
                  >
                    {t.type}
                  </span>
                </span>
                <div>
                  <div className="font-bold text-slate-900 dark:text-white">{t.party}</div>
                  <div className="text-xs text-slate-500 font-medium">
                    {t.product ? `${t.product} · ` : ""}
                    {t.category}
                    {t.qty ? ` × ${t.qty}` : ""}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </div>
                </div>
                <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                  {t.paymentMethod}
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                  {t.reference}
                </span>
                <span className="num text-right font-extrabold text-sm sm:text-base text-slate-900 dark:text-white">
                  {formatMoney(t.amountMinor, t.currency)}
                </span>
              </div>
            ))}
          </div>

          {rows.length === 0 && (
            <div className="px-4 py-12 text-center text-sm font-medium text-slate-500">
              {isLive
                ? "No live rows match your current filters. Log your first entry or clear search."
                : "No rows match. Try clearing search or choosing another filter."}
            </div>
          )}
        </div>
      </div>

      {/* Summary Footer Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <span>
          Showing <span className="font-bold text-slate-900 dark:text-white">{rows.length}</span> rows
        </span>
        <span className="chip bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 font-bold text-sm px-3.5 py-1">
          Total: {formatMoney(total, profile.currencyCode)}
        </span>
      </div>
    </div>
  );
}
