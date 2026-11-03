"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSupabaseUser, friendlyAuthError } from "@/components/auth-provider";
import { useMockStore } from "@/components/providers";
import { supabase } from "@/lib/supabase/client";

// App entry: live Supabase login for account holders, demo datasets for guests.
export default function Home() {
  const router = useRouter();
  const { session } = useMockStore();
  const { user, loading: sessionLoading } = useSupabaseUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Live session → workspace router. Mock/demo sessions bypass the gate,
    // so they keep landing on the dashboard exactly as before.
    if (!sessionLoading && user) router.replace("/business");
    else if (!sessionLoading && !user && session.authenticated) router.replace("/dashboard");
  }, [user, session.authenticated, sessionLoading, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    if (!email.includes("@") || password.length < 6) {
      setMsg("Enter a valid email and your password (6+ characters).");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setMsg(friendlyAuthError(error.message));
        return;
      }
      router.replace("/business");
    } catch {
      setMsg("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (!sessionLoading && user) {
    return <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-500">Opening your workspace…</p>;
  }

  return (
    <div className="mx-auto w-full max-w-4xl py-6 sm:py-12 animate-fade-in">
      <div className="grid gap-8 md:grid-cols-2 md:items-stretch">
        <div className="relative hidden overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 border border-slate-800/80 p-8 text-white shadow-2xl md:flex md:flex-col">
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand-500/20 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" aria-hidden="true" />

          <div className="relative z-10 flex flex-col h-full">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse" />
              AI Powered COO · Secure Portal
            </span>

            <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight text-white lg:text-4xl">
              Your business,<br />decided daily.
            </h1>
            <p className="mt-3 text-sm text-slate-300 leading-relaxed">
              Decision-first view of performance: automated executive dashboard, verified ledger, rapid log entry, and intelligent COO Copilot.
            </p>

            <ul className="mt-8 space-y-4 text-sm text-slate-200">
              <li className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 font-bold text-white shadow-sm border border-white/10">
                  ◈
                </span>
                <span>5 Core KPIs, 4 trend charts, honest comparisons</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 font-bold text-white shadow-sm border border-white/10">
                  ✓
                </span>
                <span>Row Level Security tenant isolation per business</span>
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 font-bold text-white shadow-sm border border-white/10">
                  ✦
                </span>
                <span>Evidence-cited Copilot answers from real records</span>
              </li>
            </ul>

            <div className="mt-auto pt-8 border-t border-white/10 text-xs text-slate-400">
              Demo datasets run memory-only — no live Supabase writes required to explore.
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center">
          <div className="md:hidden">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
              AI Powered COO · Secure Sign-In
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight text-slate-900 dark:text-white sm:text-3xl">
            Welcome back
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Log in to your workspace with email and password.
          </p>

          <form className="card space-y-4 mt-6 border-slate-200/80 shadow-card dark:border-slate-800/80" onSubmit={onSubmit}>
            <div>
              <label className="label" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                className="input"
                value={email}
                placeholder="you@business.com"
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                disabled={busy}
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <label className="label !mb-0" htmlFor="pw">Password</label>
                <Link href="/forgot-password" className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Forgot password?
                </Link>
              </div>
              <input
                id="pw"
                type="password"
                className="input"
                value={password}
                placeholder="••••••••"
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={busy}
              />
            </div>

            {msg && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
                {msg}
              </p>
            )}

            <button className="btn-primary w-full py-3 text-base font-bold shadow-md" type="submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign In to Workspace"}
            </button>

            <div className="space-y-2 pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
              <p>
                No account?{" "}
                <Link href="/signup" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Sign up
                </Link>
                {" "}· Just exploring?{" "}
                <Link href="/demo" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Try a demo dataset
                </Link>
              </p>
              <p>
                <Link href="/recover-email" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Forgot username?
                </Link>
                {" "}·{" "}
                <Link href="/recover-email" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                  Recover your login email
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

