"use client";

// Set a new password from a Supabase recovery link.
// Handles both link formats: PKCE (?code=, exchanged explicitly) and the
// hash-token flow (auto-detected by the Supabase client).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const code = new URLSearchParams(window.location.search).get("code");
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        }
        const { data } = await supabase.auth.getSession();
        if (active) setReady(!!data.session?.user);
      } catch {
        if (active) setReady(false);
      } finally {
        if (active) setChecking(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setOk("");
    if (pw.length < 6) {
      setMsg("Password must be at least 6 characters.");
      return;
    }
    if (pw !== confirm) {
      setMsg("The two passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) {
        setMsg("Couldn’t update the password. The link may have expired — request a new one and try again.");
        return;
      }
      setOk("Password updated. Opening your workspace…");
      setTimeout(() => router.replace("/business"), 800);
    } catch {
      setMsg("Network error. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12 animate-fade-in space-y-5">
      <div className="text-center sm:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
          Account Security
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Set a New Password
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Choose a secure 6+ character password for your account.
        </p>
      </div>

      <div className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80">
        {checking && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
            Verifying your reset link…
          </div>
        )}
        {!checking && !ready && (
          <div className="space-y-4 py-2">
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
              This reset link is invalid or has expired. Links are single-use and time-limited.
            </p>
            <Link href="/forgot-password" className="btn-primary w-full text-center py-3 font-bold shadow-md block">
              Request a New Link
            </Link>
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
                Back to log in
              </Link>
            </p>
          </div>
        )}
        {!checking && ready && (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="label" htmlFor="np-pw">New Password</label>
              <input
                id="np-pw"
                type="password"
                className="input"
                value={pw}
                placeholder="6+ characters"
                onChange={(e) => setPw(e.target.value)}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
            <div>
              <label className="label" htmlFor="np-confirm">Confirm New Password</label>
              <input
                id="np-confirm"
                type="password"
                className="input"
                value={confirm}
                placeholder="Repeat the password"
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                disabled={busy}
              />
            </div>
            {msg && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
                {msg}
              </p>
            )}
            {ok && (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs font-medium text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300" role="status">
                {ok}
              </p>
            )}
            <button className="btn-primary w-full py-3 text-base font-bold shadow-md" type="submit" disabled={busy}>
              {busy ? "Updating password…" : "Update Password & Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
