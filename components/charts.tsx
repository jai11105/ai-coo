"use client";

import { formatMoney } from "@/lib/utils";

const COLORS = [
  "linear-gradient(90deg, #0064e0, #36a3f7)",
  "linear-gradient(90deg, #10b981, #34d399)",
  "linear-gradient(90deg, #6366f1, #818cf8)",
  "linear-gradient(90deg, #f59e0b, #fbbf24)",
  "linear-gradient(90deg, #f43f5e, #fb7185)",
  "linear-gradient(90deg, #06b6d4, #22d3ee)",
  "linear-gradient(90deg, #8b5cf6, #a78bfa)",
];

export function ChartCard({
  title,
  subtitle,
  legend,
  empty,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: React.ReactNode;
  empty?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="card card-hover flex flex-col justify-between">
      <div>
        <div className="flex flex-wrap items-start justify-between gap-2.5">
          <div>
            <div className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-white">
              {title}
            </div>
            {subtitle && (
              <div className="mt-0.5 text-xs sm:text-sm font-medium text-slate-500 dark:text-slate-400">
                {subtitle}
              </div>
            )}
          </div>
          {legend}
        </div>
        {empty ? (
          <div className="mt-6 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center dark:border-slate-800 dark:bg-slate-800/40">
            <span className="text-2xl text-slate-400">📊</span>
            <p className="mt-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
              No data in this range
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Try widening dates or switching the activity slicer.
            </p>
          </div>
        ) : (
          <div className="mt-4">{children}</div>
        )}
      </div>
    </div>
  );
}

export function Bars({
  values,
  labels,
  money = false,
  currency = "INR",
  maxBars = 31,
}: {
  values: number[];
  labels: string[];
  money?: boolean;
  currency?: string;
  maxBars?: number;
}) {
  const step = Math.max(1, Math.ceil(values.length / maxBars));
  const idx = values.map((_, i) => i).filter((i) => i % step === 0);
  const vals = idx.map((i) => values[i]);
  const labs = idx.map((i) => labels[i]);
  const max = Math.max(1, ...vals.map(Math.abs));

  return (
    <div className="space-y-2">
      <div className="relative flex h-40 items-end gap-1.5 sm:h-48 pt-2" role="img" aria-label="Bar chart">
        {/* Subtle grid guideline */}
        <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-slate-200/60 dark:border-slate-800/60" />
        {vals.map((v, i) => {
          const heightPct = Math.max(3, (Math.abs(v) / max) * 100);
          return (
            <div key={i} className="group relative flex h-full flex-1 items-end">
              <div
                className="bar-anim w-full rounded-t-lg bg-gradient-to-t from-brand-600 via-brand-500 to-indigo-500 shadow-sm transition-all duration-200 group-hover:from-brand-700 group-hover:to-indigo-600 group-hover:scale-y-[1.03]"
                style={{ height: `${heightPct}%` }}
                title={money ? `${labs[i]}: ${formatMoney(v, currency)}` : `${labs[i]}: ${v.toLocaleString("en-IN")}`}
              />
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs font-semibold text-slate-500 dark:text-slate-400 num pt-1">
        <span>{labs[0] ?? ""}</span>
        <span>{labs[Math.floor(labs.length / 2)] ?? ""}</span>
        <span>{labs[labs.length - 1] ?? ""}</span>
      </div>
    </div>
  );
}

export function Hbars({
  rows,
  money = true,
  currency = "INR",
}: {
  rows: { name: string; value: number; sub?: string }[];
  money?: boolean;
  currency?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <div className="space-y-3.5 pt-1">
      {rows.map((r, i) => (
        <div key={r.name} title={money ? formatMoney(r.value, currency) : String(r.value)} className="group">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-semibold text-slate-800 dark:text-slate-200">
              {r.name}
              {r.sub ? <span className="font-medium text-slate-400"> · {r.sub}</span> : null}
            </span>
            <span className="num shrink-0 font-bold text-slate-900 dark:text-white">
              {money ? formatMoney(r.value, currency) : r.value.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="mt-1.5 h-3 w-full rounded-full bg-slate-100 p-0.5 dark:bg-slate-800/80">
            <div
              className="bar-anim h-2 rounded-full shadow-sm"
              style={{
                width: `${Math.max(2, (r.value / max) * 100)}%`,
                background: COLORS[i % COLORS.length],
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
