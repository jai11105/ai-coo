"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useMockStore } from "./providers";
import { useBusiness } from "./business-context";
import { cx } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";

export const NAV = [
  { href: "/dashboard", label: "Dashboard", short: "Home", icon: "dashboard" },
  { href: "/ledger", label: "Data / Ledger", short: "Ledger", icon: "ledger" },
  { href: "/log-entry", label: "Log Entry", short: "Log", icon: "log" },
  { href: "/copilot", label: "COO Copilot", short: "Copilot", icon: "copilot" },
];

export function ThemeControl() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const active = theme === "system" ? `system (${resolvedTheme})` : theme;
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-100/90 p-1 dark:border-slate-800/80 dark:bg-slate-800/80">
      {(["light", "dark", "system"] as const).map((m) => (
        <button
          key={m}
          onClick={() => setTheme(m)}
          className={cx(
            "rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition-all duration-150",
            mounted && theme === m
              ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
              : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          )}
          title={m === "system" ? "Follow OS" : m}
        >
          {m === "light" ? "☀️" : m === "dark" ? "🌙" : "💻"}
        </button>
      ))}
      <span className="sr-only">Active: {mounted ? active : "system"}</span>
    </div>
  );
}

// App shell: auth guard + premium website sidebar + mobile bottom nav + profile menu.
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { session } = useMockStore();
  const { userId, activeBusiness } = useBusiness();
  const isLiveCtx = Boolean(userId && activeBusiness);
  const isAuthRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/demo" ||
    pathname === "/business" ||
    pathname === "/business/new" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/recover-email";

  if (isAuthRoute) {
    return (
      <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50/50 via-slate-50 to-slate-50 dark:from-slate-900/40 dark:via-[#070b14] dark:to-[#070b14]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <BrandMark />
          <ThemeControl />
        </div>
        <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">{children}</main>
      </div>
    );
  }

  if (!session.authenticated) return <AuthRedirect />;

  const headerName = isLiveCtx ? activeBusiness!.name : session.businessName;
  const headerSub = isLiveCtx ? "Live workspace" : `${session.mode} · ${session.userName} (demo)`;

  return (
    <div className="min-h-screen bg-slate-50/60 dark:bg-[#070b14] lg:flex">
      {/* Desktop Sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-slate-800/80 bg-gradient-to-b from-slate-950 via-[#0a0f1d] to-[#0c1424] p-4 text-white lg:flex">
        <Link href="/dashboard" className="px-2 py-3 transition-opacity hover:opacity-90">
          <BrandMark dark />
        </Link>
        <BusinessCard />
        <nav className="mt-3 flex flex-col gap-1.5" aria-label="Primary">
          {NAV.map((n) => {
            const isActive = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={isActive ? "page" : undefined}
                className={cx(
                  "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150",
                  isActive
                    ? "bg-white text-slate-950 shadow-md shadow-black/20"
                    : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
                )}
              >
                <span
                  className={cx(
                    "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-brand-600 text-white shadow-sm"
                      : "bg-white/10 text-slate-300 group-hover:bg-white/15 group-hover:text-white"
                  )}
                  aria-hidden
                >
                  <NavIcon name={n.icon} />
                </span>
                {n.label}
              </Link>
            );
          })}
          <Link
            href="/settings"
            aria-current={pathname === "/settings" ? "page" : undefined}
            className={cx(
              "group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-150",
              pathname === "/settings"
                ? "bg-white text-slate-950 shadow-md shadow-black/20"
                : "text-slate-300 hover:bg-white/[0.08] hover:text-white"
            )}
          >
            <span
              className={cx(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                pathname === "/settings"
                  ? "bg-brand-600 text-white shadow-sm"
                  : "bg-white/10 text-slate-300 group-hover:bg-white/15 group-hover:text-white"
              )}
              aria-hidden
            >
              <NavIcon name="settings" />
            </span>
            Profile &amp; Settings
          </Link>
        </nav>
        <div className="mt-auto space-y-3 px-1 pb-1 pt-4 border-t border-white/10">
          <ThemeControl />
          <LogoutButton compact />
          <p className="px-1 text-xs leading-relaxed text-white/50">
            {isLiveCtx ? "Live workspace · Supabase RLS." : "Demo session · isolated mock data."}
          </p>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 px-4 py-3 backdrop-blur-md dark:border-slate-800/80 dark:bg-[#070b14]/85 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
            <Link href="/dashboard" className="lg:hidden">
              <BrandMark compact />
            </Link>
            <div className="min-w-0 flex-1 lg:max-w-lg">
              <div className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {headerName}
              </div>
              <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                {headerSub}
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="hidden sm:block">
                <ThemeControl />
              </div>
              <ProfileMenu />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
          {children}
        </main>

        {/* Mobile Navigation */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 pb-safe backdrop-blur-lg dark:border-slate-800/80 dark:bg-[#070b14]/90 lg:hidden"
          aria-label="Primary mobile"
        >
          <div className="grid grid-cols-4 px-2 py-1.5">
            {NAV.map((n) => {
              const isActive = pathname === n.href;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cx(
                    "flex flex-col items-center gap-1 rounded-xl py-1.5 text-xs font-semibold transition-colors",
                    isActive
                      ? "text-brand-600 dark:text-brand-400"
                      : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className={cx(isActive ? "scale-110 transition-transform" : "")} aria-hidden>
                    <NavIcon name={n.icon} />
                  </span>
                  <span>{n.short ?? n.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}

function BrandMark({ dark = false, compact = false }: { dark?: boolean; compact?: boolean }) {
  return (
    <span className={cx("flex items-center gap-2.5", compact && "py-0.5")}>
      <span
        className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 via-brand-500 to-indigo-600 text-white shadow-md shadow-brand-600/30 ring-1 ring-white/20"
        aria-hidden="true"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 17l6-6 4 4 8-8" />
          <path d="M14 7h7v7" />
        </svg>
      </span>
      <span className={cx("text-base font-extrabold tracking-tight sm:text-lg", dark ? "text-white" : "text-slate-900 dark:text-white")}>
        AI Powered{" "}
        <span className="bg-gradient-to-r from-brand-600 to-indigo-600 bg-clip-text text-transparent dark:from-brand-300 dark:to-indigo-300">
          COO
        </span>
      </span>
    </span>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  if (name === "dashboard") return (<svg width="18" height="18" viewBox="0 0 24 24" {...common}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>);
  if (name === "ledger") return (<svg width="18" height="18" viewBox="0 0 24 24" {...common}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5v15z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /><path d="M9 7h7M9 11h5" /></svg>);
  if (name === "log") return (<svg width="18" height="18" viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>);
  if (name === "settings") return (<svg width="18" height="18" viewBox="0 0 24 24" {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></svg>);
  return (<svg width="18" height="18" viewBox="0 0 24 24" {...common}><path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15.5l-1.9-4.6L5.5 9l4.6-1.4L12 3z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" /></svg>);
}

function AuthRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-500">Please log in…</p>;
}

function BusinessCard() {
  const { session, setDataset } = useMockStore();
  const { userId, memberships, activeBusiness, activeRole, setActive } = useBusiness();
  const isLiveCtx = Boolean(userId && activeBusiness);

  if (isLiveCtx && activeBusiness) {
    return (
      <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-sm font-extrabold text-white shadow-sm ring-1 ring-white/20">
            {(activeBusiness.name || "L").slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate font-bold tracking-tight text-white">{activeBusiness.name}</div>
            <div className="truncate text-xs font-medium text-slate-300">
              Live · {activeRole ?? "member"} · {activeBusiness.currency_code}
            </div>
          </div>
        </div>
        {memberships.length > 1 ? (
          <select
            aria-label="Switch live business"
            className="mt-2.5 w-full rounded-xl border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-white/20 focus:ring-2 focus:ring-brand-400"
            value={activeBusiness.id}
            onChange={(e) => setActive(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.business_id} value={m.business_id} className="text-slate-900">
                {m.business?.name ?? "Unnamed business"} · {m.role}
              </option>
            ))}
          </select>
        ) : (
          <Link
            href="/business"
            className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold text-brand-300 transition-colors hover:text-white"
          >
            Switch business →
          </Link>
        )}
      </div>
    );
  }

  if (userId && !activeBusiness) return null;

  return (
    <div className="mb-4 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 backdrop-blur-md shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 text-sm font-extrabold text-white shadow-sm ring-1 ring-white/20">
          {(session.businessName || "D").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold tracking-tight text-white">{session.businessName}</div>
          <div className="truncate text-xs font-medium text-slate-300">{session.mode}</div>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <button
          onClick={() => setDataset("meta_demo")}
          className={
            session.datasetKey === "meta_demo"
              ? "rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-slate-950 shadow-sm"
              : "rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          }
        >
          Meta demo
        </button>
        <button
          onClick={() => setDataset("sample_business_2")}
          className={
            session.datasetKey === "sample_business_2"
              ? "rounded-xl bg-white px-2.5 py-1.5 text-xs font-bold text-slate-950 shadow-sm"
              : "rounded-xl bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/20"
          }
        >
          Sample 2
        </button>
      </div>
      <div className="mt-2 text-xs text-slate-400">Signed in as {session.userName} (demo)</div>
    </div>
  );
}

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const { logout } = useMockStore();
  const { clearActive } = useBusiness();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await supabase.auth.signOut();
        } finally {
          clearActive();
          logout();
          setBusy(false);
          router.replace("/");
        }
      }}
      className={compact ? "btn-secondary w-full !py-2 text-xs font-bold" : "btn-secondary w-full text-sm font-bold"}
    >
      {busy ? "Logging out…" : "⎋ Log out"}
    </button>
  );
}

function ProfileMenu() {
  const { session } = useMockStore();
  const { userId, memberships, activeBusiness, activeRole, setActive } = useBusiness();
  const [open, setOpen] = useState(false);
  const isLiveCtx = Boolean(userId && activeBusiness);
  const name = isLiveCtx ? activeBusiness!.name : session.businessName;
  const sub = isLiveCtx ? `Live · ${activeRole ?? "member"}` : `${session.userName} · ${session.mode} (demo)`;
  const initial = (name || "O").slice(0, 1).toUpperCase();

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-tr from-brand-600 to-indigo-600 text-sm font-bold text-white shadow-sm ring-2 ring-brand-500/20 transition-transform active:scale-95"
        aria-label="Business profile menu"
        aria-expanded={open}
      >
        {initial}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200/90 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900 animate-slide-up">
            <div className="px-2 pb-2.5 pt-1 border-b border-slate-100 dark:border-slate-800">
              <div className="truncate text-sm font-bold text-slate-900 dark:text-white">{name}</div>
              <div className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{sub}</div>
            </div>
            <div className="pt-2 space-y-1">
              <Link
                href="/settings"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <span>⚙️</span> Profile &amp; Settings
              </Link>
              <Link
                href="/demo"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
              >
                <span>🔄</span> Switch dataset
              </Link>
            </div>
            {isLiveCtx && memberships.length > 1 && (
              <div className="mt-2 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800">
                <div className="px-1 pb-1 text-xs font-bold uppercase tracking-wider text-slate-500">
                  Switch business
                </div>
                <div className="space-y-1 mt-1">
                  {memberships.map((m) => (
                    <button
                      key={m.business_id}
                      onClick={() => {
                        setActive(m.business_id);
                        setOpen(false);
                      }}
                      className={
                        m.business_id === activeBusiness?.id
                          ? "block w-full rounded-lg bg-brand-100 px-2.5 py-1.5 text-left text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300"
                          : "block w-full rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-200/60 dark:text-slate-300 dark:hover:bg-slate-800"
                      }
                    >
                      {m.business?.name ?? "Unnamed business"}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800" onClick={() => setOpen(false)}>
              <LogoutButton compact />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
