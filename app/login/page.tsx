"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSupabaseUser, friendlyAuthError } from "@/components/auth-provider";
import { useMockStore } from "@/components/providers";
import { supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const { session } = useMockStore();
  const { user, loading: sessionLoading } = useSupabaseUser();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Live session → workspace router. Mock/demo sessions bypass the gate.
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
      // Signed in — the business gate picks create/select/dashboard.
      router.replace("/business");
    } catch {
      setMsg("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12 animate-fade-in">
      <div className="text-center sm:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
          AI Powered COO · Secure Portal
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Welcome back
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Log in with your verified email and password.
        </p>
      </div>

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
              Try a demo
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
  );
}
