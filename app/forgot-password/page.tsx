"use client";

// Forgot password: request a Supabase password-reset email.
// Always shows the same neutral confirmation so the page never reveals
// whether an email/account exists (anti-enumeration).

import Link from "next/link";
import { useState } from "react";
import { friendlyAuthError } from "@/components/auth-provider";
import { supabase } from "@/lib/supabase/client";

function isRateLimit(raw: string): boolean {
  const m = (raw || "").toLowerCase();
  return m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit");
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setOk("");
    const clean = email.trim();
    if (!clean.includes("@")) {
      setMsg("Enter the email address you signed up with.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(clean, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error && isRateLimit(error.message)) {
        setMsg(friendlyAuthError(error.message));
        return;
      }
      // Neutral response either way: never reveal account existence.
      setOk(
        "If an account exists for this email, a password-reset link is on its way. Check your inbox (and spam folder), then follow the link."
      );
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
          AI Powered COO · Account Recovery
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Forgot Password?
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Enter your login email address and we&apos;ll send you a password reset link.
        </p>
      </div>

      <form className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="fp-email">Login Email</label>
          <input
            id="fp-email"
            type="email"
            className="input"
            value={email}
            placeholder="you@business.com"
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
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
          {busy ? "Sending link…" : "Send Reset Link"}
        </button>

        <p className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Remembered it?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Back to log in
          </Link>
        </p>
      </form>
    </div>
  );
}
