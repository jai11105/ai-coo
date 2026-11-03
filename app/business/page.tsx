"use client";

// Business selection (Phase 3 · Task C).
//
// - Lists the memberships from business_members for the signed-in user.
// - One tap selects the active workspace and continues to the dashboard.
// - Zero memberships → points to /business/new (the gate also reroutes).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useBusiness } from "@/components/business-context";

export default function BusinessListPage() {
  const router = useRouter();
  const { userId, memberships, activeBusinessId, loading, error, refresh, setActive } =
    useBusiness();
  const [busyId, setBusyId] = useState<string | null>(null);

  const pick = (id: string) => {
    if (busyId) return;
    setBusyId(id);
    setActive(id);
    router.replace("/dashboard");
  };

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12 animate-fade-in space-y-5">
      <div className="text-center sm:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
          Organization Directory
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Choose a Business
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {loading
            ? "Loading your workspaces…"
            : !userId
              ? "Business workspaces need a signed-in account. Demo explorers can keep using demo datasets."
              : `${memberships.length} ${memberships.length === 1 ? "organization" : "organizations"} available.`}
        </p>
      </div>

      <div className="card space-y-3 border-slate-200/80 shadow-card dark:border-slate-800/80">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            Loading workspaces…
          </div>
        )}

        {!loading && !userId && (
          <div className="space-y-3 py-2 text-center sm:text-left">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You’re currently browsing in demo mode — no live businesses connected.
            </p>
            <Link href="/dashboard" className="btn-primary w-full text-center py-2.5">Back to Dashboard</Link>
          </div>
        )}

        {!loading && userId && error && (
          <div className="space-y-3">
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
              {error}
            </p>
            <button className="btn-secondary w-full py-2.5" onClick={() => void refresh()}>
              Retry
            </button>
          </div>
        )}

        {!loading && userId && !error && memberships.length === 0 && (
          <div className="space-y-4 py-2 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-300">
              No businesses yet. Create your first workspace to start recording transactions.
            </p>
            <Link href="/business/new" className="btn-primary w-full text-center py-3 font-bold shadow-md">
              Create Your First Business →
            </Link>
          </div>
        )}

        {!loading && userId && !error && memberships.length > 0 && (
          <>
            <div className="space-y-2.5">
              {memberships.map((m) => {
                const isActive = m.business_id === activeBusinessId;
                return (
                  <button
                    key={m.business_id}
                    onClick={() => pick(m.business_id)}
                    disabled={busyId !== null}
                    className={
                      isActive
                        ? "w-full rounded-2xl border-2 border-brand-500 bg-gradient-to-b from-brand-50/70 to-white p-4 text-left shadow-sm ring-2 ring-brand-500/10 dark:from-brand-950/40 dark:to-slate-900 transition-all"
                        : "w-full rounded-2xl border border-slate-200 bg-white/70 p-4 text-left hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/70 dark:hover:border-slate-700 transition-all"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {m.business?.name ?? "Unnamed business"}
                      </div>
                      {isActive && (
                        <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span>{m.role}{m.business ? ` · ${m.business.country_code} · ${m.business.currency_code}` : ""}</span>
                      <span className="font-semibold text-brand-600 dark:text-brand-400">
                        {busyId === m.business_id ? "Opening…" : isActive ? "Active · Continue →" : "Select →"}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="pt-2">
              <Link href="/business/new" className="btn-secondary w-full text-center py-2.5 font-semibold">
                + Create Another Business
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
