"use client";

import { useRouter } from "next/navigation";
import { DEMO_DATASETS } from "@/lib/mock-data";
import { useMockStore } from "@/components/providers";
import type { DemoDatasetKey } from "@/lib/types";

export default function DemoPage() {
  const router = useRouter();
  const { session, setDataset, login } = useMockStore();

  const pick = (key: DemoDatasetKey) => {
    setDataset(key);
    if (!session.authenticated) login("Demo Owner");
    // replace: no extra history entry, so Back never lands on a stale gate.
    router.replace("/dashboard");
  };

  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-10 animate-fade-in space-y-6">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 border border-slate-800/80 p-6 sm:p-7 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400" />
            Sandbox Environment · Memory-Only
          </span>
          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            Choose a Demo Dataset
          </h1>
          <p className="mt-1.5 text-xs text-slate-300 sm:text-sm leading-relaxed">
            Currently active: <span className="font-semibold text-white">{session.businessName}</span>. Test live-feeling analytics, calculations, and AI responses without setting up Supabase.
          </p>
        </div>
      </div>

      {/* Dataset Selection Cards */}
      <div className="grid gap-5 md:grid-cols-2">
        {DEMO_DATASETS.map((d) => {
          const isMeta = d.key === "meta_demo";
          return (
            <div
              key={d.key}
              className="card flex flex-col justify-between border-slate-200/80 shadow-card dark:border-slate-800/80 hover:shadow-card-hover transition-all"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
                    {isMeta ? "Meta Demo" : "Second Dataset"}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">Ready</span>
                </div>

                <h2 className="mt-3 text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                  {d.name}
                </h2>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed sm:text-sm">
                  {d.description}
                </p>

                <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
                  {d.highlights.map((h) => (
                    <li key={h} className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                        ✓
                      </span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                onClick={() => pick(d.key as DemoDatasetKey)}
                className="btn-primary mt-6 w-full py-3 text-sm font-bold shadow-md"
              >
                Launch {isMeta ? "Meta Demo" : "Sample 2"} (Mock) →
              </button>
            </div>
          );
        })}
      </div>

      {/* Information Banner */}
      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 leading-relaxed">
        <span className="font-semibold text-slate-700 dark:text-slate-300">Note: </span>
        Switching datasets swaps the client-side state without altering backend database rows. Demo datasets are completely isolated from live workspace databases.
      </div>
    </div>
  );
}
