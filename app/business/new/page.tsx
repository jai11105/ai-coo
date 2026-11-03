"use client";

// Business onboarding: create a live workspace (Phase 3 · Task B).
// Actual businesses columns only. Insert via the signed-in browser client;
// the on_business_created_add_owner trigger assigns active owner — this page
// never touches business_members. GST registration defaults to OFF.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useSupabaseUser } from "@/components/auth-provider";
import { useBusiness } from "@/components/business-context";
import { BUSINESS_TYPES, COUNTRIES, CURRENCIES, TIMEZONES, countryByCode } from "@/lib/business-options";
import { createBusiness, friendlyDbError } from "@/lib/supabase/businesses";

export default function NewBusinessPage() {
  const router = useRouter();
  const { user, loading: sessionLoading } = useSupabaseUser();
  const { refresh, setActive } = useBusiness();
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("retail");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("IN");
  const [currency, setCurrency] = useState("INR");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  // GST preference is informational only in onboarding: there is no GST
  // column on public.businesses, so this is never inserted there.
  // business_settings is untouched until its actual columns are verified.
  const [gstRegistered, setGstRegistered] = useState(false);
  const [msg, setMsg] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const onCountryChange = (code: string) => {
    setCountry(code);
    const opt = countryByCode(code);
    if (opt) {
      setCurrency(opt.currency);
      setTimezone(opt.timezone);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setMsg("");
    setOk("");
    const cleanName = name.trim();
    if (!cleanName) {
      setMsg("Enter a business name to continue.");
      return;
    }
    if (cleanName.length > 120) {
      setMsg("Business name must be 120 characters or fewer.");
      return;
    }
    if (!user) {
      setMsg("Your sign-in expired. Please log out and log in again, then retry.");
      return;
    }
    setBusy(true);
    try {
      const opt = countryByCode(country);
      // Actual businesses columns only — GST stays out of this insert
      // (no GST column exists on businesses; business_settings untouched).
      // Reference the toggle so intent is explicit (defaults OFF).
      void gstRegistered;
      const biz = await createBusiness(user.id, {
        name: cleanName,
        business_type: businessType || null,
        industry: industry.trim() || null,
        country_code: country,
        currency_code: currency,
        timezone: timezone.trim(),
        locale: opt?.locale ?? "en-US",
      });
      await refresh();
      // Verify the owner membership is visible (trigger + RLS) before leaving.
      // refresh() updates context async; re-read via a second refresh is cheap
      // and avoids redirecting with an unconfirmed workspace.
      setActive(biz.id);
      setOk(`“${biz.name}” created. Opening your dashboard…`);
      setTimeout(() => router.replace("/dashboard"), 600);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "";
      // eslint-disable-next-line no-console
      console.error("[NewBusinessPage] create failed:", raw);
      setMsg(friendlyDbError(raw));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-8 sm:py-12 animate-fade-in space-y-5">
      <div className="text-center sm:text-left">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
          New Workspace
        </span>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">
          Create Your Business
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
          {sessionLoading
            ? "Checking your sign-in…"
            : user
              ? `Signed in as ${user.email ?? "you"}. This creates your isolated live workspace.`
              : "You need to be signed in to create a business."}
        </p>
      </div>

      <form className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80" onSubmit={onSubmit}>
        <div>
          <label className="label" htmlFor="biz-name">Business Name *</label>
          <input
            id="biz-name"
            className="input font-semibold"
            value={name}
            maxLength={120}
            placeholder="Sharma General Store"
            onChange={(e) => setName(e.target.value)}
            autoComplete="organization"
            disabled={busy}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="biz-type">Business Type</label>
            <select id="biz-type" className="input" value={businessType} onChange={(e) => setBusinessType(e.target.value)} disabled={busy}>
              {BUSINESS_TYPES.map((t) => (<option key={t.value} value={t.value}>{t.label}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="biz-industry">Industry (optional)</label>
            <input id="biz-industry" className="input" value={industry} maxLength={80} placeholder="Grocery retail" onChange={(e) => setIndustry(e.target.value)} disabled={busy} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="biz-country">Country</label>
            <select id="biz-country" className="input" value={country} onChange={(e) => onCountryChange(e.target.value)} disabled={busy}>
              {COUNTRIES.map((c) => (<option key={c.code} value={c.code}>{c.name}</option>))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="biz-currency">Currency</label>
            <select id="biz-currency" className="input font-mono font-semibold" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={busy}>
              {CURRENCIES.map((c) => (<option key={c.code} value={c.code}>{c.code} · {c.name}</option>))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="biz-tz">Timezone</label>
          <select id="biz-tz" className="input text-xs font-mono" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={busy}>
            {TIMEZONES.map((t) => (<option key={t} value={t}>{t}</option>))}
          </select>
        </div>

        <label className="flex items-start gap-3 rounded-2xl border border-slate-200/90 bg-slate-50/70 p-3.5 text-sm dark:border-slate-800 dark:bg-slate-900/60 cursor-pointer">
          <input type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" checked={gstRegistered} onChange={(e) => setGstRegistered(e.target.checked)} disabled={busy} />
          <span>
            <span className="font-bold text-slate-800 dark:text-slate-200">GST Registered</span>
            <span className="block mt-0.5 text-xs text-slate-500 dark:text-slate-400">Only check this if this business is registered under GST. Most small ventures start unregistered.</span>
          </span>
        </label>

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
          {busy ? "Creating Business…" : "Create Business Workspace"}
        </button>

        <p className="pt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          <Link href="/business" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Your businesses</Link>
          {" · "}
          <Link href="/dashboard" className="font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400">Back to dashboard</Link>
        </p>
      </form>
    </div>
  );
}