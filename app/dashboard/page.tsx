"use client";

import { useMemo, useState } from "react";
import { useBusiness } from "@/components/business-context";
import { useMockStore } from "@/components/providers";
import { useWorkspace } from "@/components/workspace-context";
import { groupItemsByTxn, liveToMockTransactions, withQuantities } from "@/lib/live-adapter";
import { Bars, ChartCard, Hbars } from "@/components/charts";
import {
  buildCategorySplit,
  buildInsights,
  buildKpis,
  buildTopProducts,
  buildTrend,
  buildTypeCompare,
  calcTotals,
  compareRange,
  filterByRange,
  filterByScope,
  resolveRange,
  resolveRangeInTimezone,
} from "@/lib/analytics";
import type { ActivityScope, CompareMode, DatePreset } from "@/lib/types";
import { cx, formatMoney } from "@/lib/utils";

const SCOPES: ActivityScope[] = ["All", "Sales", "Purchase", "Expense"];
const PRESETS: DatePreset[] = ["Today", "Yesterday", "This Week", "This Month", "Last Month", "Custom"];

export default function DashboardPage() {
  const { transactions: mockTxns, profile: mockProfile } = useMockStore();
  const { userId, activeBusiness, activeBusinessId } = useBusiness();
  const { transactions: liveTxns, items: liveItems, categories, loading, error, refresh } = useWorkspace();

  // Live for signed-in workspace; demo/mock sessions keep isolated datasets.
  const isLive = Boolean(userId && activeBusinessId);
  // Business-local timezone (AZ uses Asia/Kolkata). Live presets anchor on
  // THIS timezone — never the browser/UTC date or the demo anchor.
  const businessTimezone = isLive ? activeBusiness?.timezone ?? "UTC" : undefined;
  const categoryById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const itemsByTxn = useMemo(() => groupItemsByTxn(liveItems ?? []), [liveItems]);
  const transactions = useMemo(
    () =>
      isLive
        ? withQuantities(
            liveToMockTransactions(liveTxns, categoryById, activeBusiness?.currency_code ?? "INR", businessTimezone),
            itemsByTxn
          )
        : mockTxns,
    [isLive, liveTxns, itemsByTxn, categoryById, activeBusiness?.currency_code, businessTimezone, mockTxns]
  );
  const profile = useMemo(
    () =>
      isLive && activeBusiness
        ? {
            ...mockProfile,
            name: activeBusiness.name,
            industry: activeBusiness.industry ?? mockProfile.industry,
            businessType: activeBusiness.business_type ?? mockProfile.businessType,
            countryCode: activeBusiness.country_code,
            currencyCode: activeBusiness.currency_code,
            timezone: activeBusiness.timezone,
          }
        : mockProfile,
    [isLive, activeBusiness, mockProfile]
  );
  const [scope, setScope] = useState<ActivityScope>("All");
  const [preset, setPreset] = useState<DatePreset>("This Month");
  const [compare, setCompare] = useState<CompareMode>("Previous Period");
  const [custom, setCustom] = useState({ start: "2026-10-01", end: "2026-10-31" });

  const range = useMemo(
    () => (isLive ? resolveRangeInTimezone(preset, custom, businessTimezone) : resolveRange(preset, custom)),
    [isLive, preset, custom, businessTimezone]
  );
  const cmpRange = useMemo(() => compareRange(range, compare), [range, compare]);
  const inRange = useMemo(() => filterByRange(transactions, range, businessTimezone), [transactions, range, businessTimezone]);
  const inCompare = useMemo(() => filterByRange(transactions, cmpRange, businessTimezone), [transactions, cmpRange, businessTimezone]);
  const scoped = useMemo(() => filterByScope(inRange, scope), [inRange, scope]);
  const scopedPrev = useMemo(() => filterByScope(inCompare, scope), [inCompare, scope]);
  const totals = useMemo(() => calcTotals(filterByScope(inRange, "All")), [inRange]);
  const prevTotals = useMemo(() => calcTotals(filterByScope(inCompare, "All")), [inCompare]);
  const kpis = useMemo(
    () => buildKpis(calcTotals(scoped), calcTotals(scopedPrev), scope, profile.currencyCode),
    [scoped, scopedPrev, scope, profile.currencyCode]
  );
  const trend = useMemo(() => buildTrend(filterByScope(inRange, "All"), range, businessTimezone), [inRange, range, businessTimezone]);
  const catSplit = useMemo(() => buildCategorySplit(scoped), [scoped]);
  const typeCmp = useMemo(() => buildTypeCompare(inRange), [inRange]);
  const topProducts = useMemo(() => buildTopProducts(scoped), [scoped]);
  const insights = useMemo(() => buildInsights(totals, prevTotals, range, scope), [totals, prevTotals, range, scope]);

  return (
    <div className="space-y-6">
      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-950 via-[#0a2540] to-blue-700 p-6 sm:p-8 text-white shadow-xl shadow-blue-950/10 border border-white/10">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 -left-20 h-64 w-64 rounded-full bg-indigo-500/20 blur-3xl" aria-hidden="true" />
        
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="chip bg-white/15 text-white backdrop-blur-md border border-white/20">
              {isLive ? "Live workspace" : "Demo dataset"} · {profile.currencyCode}
            </span>
            <h1 className="mt-3 truncate text-2xl font-extrabold tracking-tight sm:text-3xl text-white">
              {profile.name}
            </h1>
            <p className="mt-1.5 text-xs sm:text-sm font-medium text-blue-100/80">
              {inRange.length} transactions · {range.start} → {range.end} · vs {cmpRange.start} → {cmpRange.end}
              {isLive ? " · live" : " · demo"}
            </p>
          </div>
          {isLive && error && (
            <button
              className="rounded-xl bg-white/20 px-4 py-2 text-xs font-bold text-white backdrop-blur hover:bg-white/30 transition-colors shadow-sm"
              onClick={() => void refresh()}
            >
              Retry
            </button>
          )}
        </div>

        {isLive && loading && (
          <p className="relative mt-3 text-xs sm:text-sm font-medium text-white/80 animate-pulse">
            Loading live transactions…
          </p>
        )}
        {isLive && error && (
          <p className="relative mt-3 rounded-2xl bg-red-500/30 border border-red-400/40 px-4 py-2.5 text-xs sm:text-sm font-medium text-white backdrop-blur-sm" role="alert">
            {error}
          </p>
        )}
        {isLive && !loading && !error && transactions.length === 0 && (
          <p className="relative mt-3 text-xs sm:text-sm text-white/90">
            No transactions yet for {profile.name} — log your first sale, purchase, or expense.
          </p>
        )}
        {isLive && !loading && !error && transactions.length > 0 && inRange.length === 0 && (
          <p className="relative mt-3 rounded-2xl bg-amber-400/25 border border-amber-300/30 px-4 py-2.5 text-xs sm:text-sm text-amber-100 backdrop-blur-sm">
            {transactions.length} live transactions exist, but none fall in {range.start} → {range.end}. New saves use today&apos;s date — switch preset to Today/This Month or widen Custom range.
          </p>
        )}
      </div>

      {/* Slicers & Presets Control Card */}
      <div className="card space-y-4 sm:space-y-5">
        <div>
          <div className="label">Global Activity Slicer</div>
          <div
            className="inline-flex flex-wrap gap-1.5 rounded-2xl bg-slate-100/90 p-1.5 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60"
            role="tablist"
            aria-label="Activity scope"
          >
            {SCOPES.map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={scope === s}
                onClick={() => setScope(s)}
                className={cx(
                  "rounded-xl px-4 py-2 text-xs sm:text-sm font-bold transition-all duration-150",
                  scope === s
                    ? "bg-white text-brand-600 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <div className="label">Date preset</div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPreset(p)}
                  className={cx(
                    "rounded-xl px-3.5 py-2 text-xs sm:text-sm font-semibold transition-all duration-150",
                    preset === p
                      ? "bg-brand-600 text-white shadow-md shadow-brand-600/20"
                      : "bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700/80"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            {preset === "Custom" && (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="cs">Start Date</label>
                  <input
                    id="cs"
                    type="date"
                    className="input"
                    value={custom.start}
                    max={custom.end}
                    onChange={(e) => setCustom((c) => ({ ...c, start: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ce">End Date</label>
                  <input
                    id="ce"
                    type="date"
                    className="input"
                    value={custom.end}
                    min={custom.start}
                    onChange={(e) => setCustom((c) => ({ ...c, end: e.target.value }))}
                  />
                </div>
              </div>
            )}
          </div>
          <div>
            <label className="label" htmlFor="cmp">Compare to</label>
            <select
              id="cmp"
              className="input font-medium"
              value={compare}
              onChange={(e) => setCompare(e.target.value as CompareMode)}
            >
              <option>Previous Period</option>
              <option>Same Period Last Year</option>
            </select>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 font-medium">
              Comparison: vs {cmpRange.start} → {cmpRange.end}
            </p>
          </div>
        </div>
      </div>

      {/* 5 Prominent KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        {kpis.map((k) => {
          const d = k.deltaPct;
          const isZeroRange = d == null && k.valueMinor === 0;
          const arrow = d == null ? (isZeroRange ? "●" : "◆") : d > 0 ? "▲" : d < 0 ? "▼" : "●";
          const label = d == null ? (isZeroRange ? "—" : "New") : `${Math.abs(d).toFixed(1)}%`;
          
          const tone =
            d == null
              ? "text-slate-500 bg-slate-100/90 border-slate-200/80 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700"
              : d < 0 && k.key !== "expenses"
                ? "text-rose-600 bg-rose-50 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/60"
                : d > 0
                  ? "text-emerald-700 bg-emerald-50 border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60"
                  : "text-slate-500 bg-slate-100/90 border-slate-200/80 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";

          const bar =
            k.key === "revenue"
              ? "from-emerald-500 to-teal-500"
              : k.key === "cogs"
                ? "from-amber-500 to-orange-500"
                : k.key === "gross"
                  ? "from-brand-500 to-indigo-600"
                  : k.key === "expenses"
                    ? "from-rose-500 to-red-500"
                    : "from-violet-500 to-purple-600";

          return (
            <div key={k.key} className="card card-hover flex flex-col justify-between !p-4 sm:!p-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`h-8 w-1.5 rounded-full bg-gradient-to-b ${bar}`} aria-hidden="true" />
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {k.label}
                  </div>
                </div>
                <div className="num mt-3 text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {formatMoney(k.valueMinor, k.currency)}
                </div>
              </div>
              <div className="mt-3">
                <div className={cx("num inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold border", tone)}>
                  <span>{arrow}</span>
                  <span>{label}</span>
                </div>
                <div className="mt-2 text-xs leading-snug text-slate-400 sm:text-xs font-medium">
                  {d == null ? (isZeroRange ? "no data in either period" : `${k.hint} · no prior value`) : k.hint}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Visualizations Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard
          title="Revenue trend"
          subtitle={`Daily revenue · ${range.start} → ${range.end}`}
          legend={
            <span className="chip bg-brand-50 text-brand-700 border border-brand-200/80 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800/60 font-bold">
              Total {formatMoney(scoped.filter((t) => t.type === "sale").reduce((s, t) => s + t.amountMinor, 0), profile.currencyCode)}
            </span>
          }
          empty={trend.every((t) => t.revenue === 0)}
        >
          <Bars values={trend.map((t) => t.revenue)} labels={trend.map((t) => t.label)} money currency={profile.currencyCode} maxBars={trend.length || 1} />
        </ChartCard>

        <ChartCard
          title="Category distribution"
          subtitle="Share of filtered total by category"
          legend={
            <span className="chip bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-semibold">
              {catSplit.length} categories
            </span>
          }
          empty={catSplit.length === 0}
        >
          <Hbars rows={catSplit.slice(0, 7).map((c) => ({ name: c.name, value: c.value, sub: `${c.pct.toFixed(1)}%` }))} currency={profile.currencyCode} />
        </ChartCard>

        <ChartCard
          title="Sales vs Purchase vs Expense"
          subtitle="Filtered range totals (slicer-independent)"
          legend={
            <span className="chip bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 font-semibold">
              {inRange.length} txns
            </span>
          }
          empty={typeCmp.every((r) => r.value === 0)}
        >
          <Hbars rows={typeCmp.map((r) => ({ name: r.type, value: r.value, sub: `${r.count} txns` }))} currency={profile.currencyCode} />
          <p className="mt-3 text-xs text-slate-400 font-medium">Purchases are stock acquisitions — COGS is counted on Sales only.</p>
        </ChartCard>

        <ChartCard
          title="Top products"
          subtitle="By revenue in current filter"
          legend={
            <span className="chip bg-emerald-50 text-emerald-700 border border-emerald-200/80 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60 font-bold">
              {scope} scope
            </span>
          }
          empty={topProducts.length === 0}
        >
          <Hbars rows={topProducts.map((p, i) => ({ name: `${i + 1}. ${p.name}`, value: p.revenue, sub: p.qty == null ? "qty unknown (no line items)" : `${p.qty} units` }))} currency={profile.currencyCode} />
          {topProducts.some((p) => p.qty == null) && (
            <p className="mt-3 text-xs text-slate-400 font-medium">Historical sales without saved line items show actual revenue with unknown quantity — quantities are never invented. New sales persist quantity via transaction_items.</p>
          )}
        </ChartCard>
      </div>

      {/* Insights Section */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 text-base shadow-sm">
            ✦
          </span>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Insights from this filter
          </h2>
        </div>
        <ul className="space-y-2.5 text-sm">
          {insights.map((line, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-xl border border-slate-200/70 bg-gradient-to-r from-slate-50/80 to-white p-3.5 dark:border-slate-800 dark:from-slate-800/50 dark:to-slate-900/70 font-medium text-slate-700 dark:text-slate-200 shadow-xs hover:border-brand-500/30 transition-colors"
            >
              <span className="text-base leading-none">💡</span>
              <span className="leading-relaxed">{line}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
