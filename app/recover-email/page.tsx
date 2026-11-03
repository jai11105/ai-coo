"use client";

// Recover your login email (there is NO separate username in this app —
// sign-in uses the email address from signup). Guidance-only page: it never
// asks for secrets and never reveals whether any account exists.

import Link from "next/link";

export default function RecoverEmailPage() {
  return (
    <div className="mx-auto max-w-md py-8 sm:py-12 animate-fade-in space-y-5">
      <div className="text-center sm:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
          AI Powered COO · Account Recovery
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Recover Login Email
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          This app has no separate username — you log in with the email address you signed up with.
        </p>
      </div>

      <div className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80 text-sm text-slate-600 dark:text-slate-300">
        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="font-bold text-slate-900 dark:text-white">1. Search your inbox</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Search for the welcome or email-confirmation message — it was sent to your login address.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="font-bold text-slate-900 dark:text-white">2. Try password reset</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Try any email you may have used. For privacy it always shows the same message, but the real account will receive the link.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/60">
          <p className="font-bold text-slate-900 dark:text-white">3. Still stuck?</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Contact support from an address you own and provide your registered business name — never share your password.
          </p>
        </div>

        <Link href="/forgot-password" className="btn-primary w-full text-center py-3 font-bold shadow-md block">
          Try Password Reset →
        </Link>

        <p className="pt-1 text-center text-xs text-slate-500 dark:text-slate-400">
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Back to log in</Link>
          {" · "}
          <Link href="/signup" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Create a new account</Link>
        </p>
      </div>
    </div>
  );
}
