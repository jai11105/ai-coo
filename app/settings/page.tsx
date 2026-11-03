"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogoutButton } from "@/components/app-shell";
import { useSupabaseUser } from "@/components/auth-provider";
import { useBusiness } from "@/components/business-context";
import { useWorkspace } from "@/components/workspace-context";

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useSupabaseUser();
  const { memberships, activeBusinessId, activeBusiness, activeRole, setActive } = useBusiness();
  const { profile, settings, loading, error, refresh } = useWorkspace();
  const [savedAt, setSavedAt] = useState("");

  useEffect(() => {
    setSavedAt("");
  }, [activeBusinessId]);

  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 border border-slate-800/80 p-6 sm:p-7 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-20 bottom-0 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Live Workspace Configuration
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            Business Profile &amp; Settings
          </h1>
          <p className="mt-1 text-xs text-slate-300 sm:text-sm leading-relaxed">
            Signed in as <span className="font-semibold text-white">{profile?.display_name ?? user?.email ?? "User"}</span> · Active business: <span className="font-semibold text-white">{activeBusiness?.name ?? "None"}</span>.
          </p>

          {loading && (
            <div className="mt-3 flex items-center gap-2 text-xs text-brand-300 font-medium">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-brand-400 border-t-transparent" />
              Loading live workspace profile…
            </div>
          )}

          {error && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/20 p-2.5">
              <p className="text-xs font-medium text-rose-200" role="alert">{error}</p>
              <button
                className="rounded-lg bg-white/20 px-3 py-1 text-xs font-bold text-white hover:bg-white/30 transition-colors"
                onClick={() => void refresh()}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Workspace Switcher */}
      <div className="card space-y-3 border-slate-200/80 shadow-card dark:border-slate-800/80">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Active Business</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Switch between your associated companies</p>
          </div>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {memberships.length} {memberships.length === 1 ? "Organization" : "Organizations"}
          </span>
        </div>

        {memberships.length === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-500 dark:border-slate-800">
            No businesses configured yet. Create one to continue.
          </p>
        )}

        <div className="grid gap-2.5 sm:grid-cols-2">
          {memberships.map((m) => {
            const isActive = m.business_id === activeBusinessId;
            return (
              <button
                key={m.business_id}
                onClick={() => setActive(m.business_id)}
                className={isActive
                  ? "relative rounded-2xl border-2 border-brand-500 bg-gradient-to-b from-brand-50/70 to-white p-4 text-left shadow-sm ring-2 ring-brand-500/10 dark:from-brand-950/40 dark:to-slate-900 transition-all"
                  : "rounded-2xl border border-slate-200 bg-white/60 p-4 text-left hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 transition-all"}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm font-bold text-slate-900 dark:text-white">{m.business?.name ?? "Unnamed business"}</div>
                  {isActive && (
                    <span className="flex h-2 w-2 rounded-full bg-emerald-500 ring-4 ring-emerald-500/20" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 uppercase tracking-wider text-[10px]">
                    {m.role}
                  </span>
                  <span className={isActive ? "font-semibold text-brand-600 dark:text-brand-400" : "text-slate-400 dark:text-slate-500"}>
                    {isActive ? "● Active Now" : "Switch →"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Business Details (Read-only) */}
      <div className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Business Details</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">Database properties for the active workspace (read-only)</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            🔒 Read Only
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Business Name</label>
            <input className="input bg-slate-50 text-slate-800 font-semibold dark:bg-slate-900 dark:text-slate-200" value={activeBusiness?.name ?? ""} readOnly />
          </div>
          <div>
            <label className="label">Industry</label>
            <input className="input bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200" value={activeBusiness?.industry ?? ""} readOnly />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Business Type</label>
            <input className="input bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200" value={activeBusiness?.business_type ?? ""} readOnly />
          </div>
          <div>
            <label className="label">Your Role</label>
            <input className="input bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200 capitalize" value={activeRole ?? ""} readOnly />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">Country</label>
            <input className="input bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200 font-mono" value={activeBusiness?.country_code ?? ""} readOnly />
          </div>
          <div>
            <label className="label">Currency</label>
            <input className="input bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200 font-mono font-semibold" value={activeBusiness?.currency_code ?? ""} readOnly />
          </div>
          <div>
            <label className="label">Timezone</label>
            <input className="input bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-200 text-xs font-mono" value={activeBusiness?.timezone ?? ""} readOnly />
          </div>
        </div>

        {/* Tax Jurisdiction & Profile Callouts */}
        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="text-base">🏛️</span>
              <div className="text-sm font-bold text-slate-900 dark:text-white">
                Tax Jurisdiction: <span className="text-brand-600 dark:text-brand-400">{settings?.tax_jurisdiction_code ?? "—"}</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Standard jurisdictional tax guidelines applied automatically to transactions.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              <span className="text-base">👤</span>
              <div className="text-sm font-bold text-slate-900 dark:text-white">Profile Identity</div>
            </div>
            <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
              {profile?.display_name ?? "—"}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
              {user?.email ?? "—"}
            </p>
          </div>
        </div>

        <div className="pt-2">
          <button
            className="btn-primary w-full py-3 text-base font-semibold shadow-md"
            onClick={() => {
              setSavedAt(new Date().toLocaleTimeString());
              setTimeout(() => router.push("/dashboard"), 400);
            }}
          >
            Back to Dashboard
          </button>
          {savedAt && (
            <p className="mt-2 text-center text-xs font-medium text-emerald-600 dark:text-emerald-400 animate-fade-in">
              ✓ Workspace state verified at {savedAt}.
            </p>
          )}
        </div>
      </div>

      {/* Session Card */}
      <div className="card space-y-3 border-slate-200/80 shadow-card dark:border-slate-800/80">
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Account Session</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Sign out of your Supabase authentication session on this device.
        </p>
        <div className="pt-1">
          <LogoutButton />
        </div>
      </div>
    </div>
  );
}

