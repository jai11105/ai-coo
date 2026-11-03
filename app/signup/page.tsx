"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSupabaseUser, friendlyAuthError } from "@/components/auth-provider";
import { useMockStore } from "@/components/providers";
import { supabase } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const { session } = useMockStore();
  const { user, loading: sessionLoading } = useSupabaseUser();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Live session → workspace router. Mock/demo sessions bypass the gate.
    if (!sessionLoading && user) router.replace("/business");
    else if (!sessionLoading && !user && session.authenticated) router.replace("/dashboard");
  }, [user, session.authenticated, sessionLoading, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setOk("");
    if (!name.trim() || !email.includes("@") || password.length < 6) {
      setMsg("Enter your name, a valid email, and a 6+ character password.");
      return;
    }
    setBusy(true);
    try {
      // Auth only. No business is created here — business
      // creation/selection is a separate step (and needs its own DB change).
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() } },
      });
      if (error) {
        setMsg(friendlyAuthError(error.message));
        return;
      }
      if (data.session?.user) {
        // Email confirmation OFF: already signed in — the business gate
        // routes to /business/new or the dashboard from there.
        router.replace("/business");
        return;
      }
      // Email confirmation ON: no session yet — ask to verify, keep form usable.
      setOk(
        `Account created for ${email.trim()}. Please check your inbox and confirm your email, then log in.`
      );
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
          AI Powered COO · Live Workspace
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Create your account
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          Sign up with your name, work email, and password.
        </p>
      </div>

      <form className="card space-y-4 mt-6 border-slate-200/80 shadow-card dark:border-slate-800/80" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="name">Your Full Name</label>
          <input
            id="name"
            className="input"
            value={name}
            placeholder="Priya Sharma"
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            disabled={busy}
          />
        </div>

        <div>
          <label className="label" htmlFor="email">Work Email</label>
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
          <label className="label" htmlFor="pw">Password</label>
          <input
            id="pw"
            type="password"
            className="input"
            value={password}
            placeholder="6+ characters"
            onChange={(e) => setPassword(e.target.value)}
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
          {busy ? "Creating account…" : "Create Workspace Account"}
        </button>

        <p className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
