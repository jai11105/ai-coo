"use client";

// Real Supabase Auth session layer.
//
// - Owns NOTHING about business data: Dashboard, Ledger, Log Entry and
//   Copilot keep reading the Phase 1 mock store untouched.
// - Keeps the existing mock-session gate (`session.authenticated`) working by
//   syncing it with the real Supabase session: any signed-in Supabase user
//   counts as authenticated, and demo-mode mock logins keep working.
// - Session restore on refresh is automatic: supabase-js persists the session
//   (localStorage) and `SupabaseAuthSync` re-applies it on mount.
// - NEVER writes to `profiles` here (see report: needs a separate DB change).

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { useMockStore } from "./providers";

/** Display name for a Supabase user: auth metadata → email prefix → fallback. */
export function displayNameFor(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMeta = typeof meta.display_name === "string" ? meta.display_name.trim() : "";
  if (fromMeta) return fromMeta;
  const email = user.email ?? "";
  const prefix = email.includes("@") ? email.split("@")[0] : "";
  return prefix || "Owner";
}

/**
 * Map raw Supabase Auth errors to clear, user-friendly messages.
 * Never echoes secrets or internal details.
 */
export function friendlyAuthError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid email or password")) {
    return "Incorrect email or password. Please try again.";
  }
  if (m.includes("email not confirmed") || m.includes("email not verified") || m.includes("confirmation")) {
    return "Please confirm your email first — check your inbox for the confirmation link, then log in.";
  }
  if (
    m.includes("user already registered") ||
    m.includes("already been registered") ||
    m.includes("already exists") ||
    m.includes("duplicate")
  ) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("6 characters") || m.includes("weak"))) {
    return "Password must be at least 6 characters.";
  }
  if (m.includes("rate limit") || m.includes("too many") || m.includes("over_email_send_rate_limit")) {
    return "Too many attempts. Please wait a minute and try again.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }
  return "Something went wrong. Please try again.";
}

/**
 * Syncs the app's session gate with the real Supabase session.
 * Mount ONCE inside <AppProviders> (it needs the mock store context).
 */
export function SupabaseAuthSync() {
  const { login, logout } = useMockStore();
  useEffect(() => {
    let active = true;
    // Refresh-restore: re-apply the persisted session on mount.
    // A rejected getSession (offline/blocked storage) must not leave the
    // gate hanging — there is simply no live session to apply.
    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session?.user) login(displayNameFor(data.session.user));
    }).catch(() => undefined);
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      // INITIAL_SESSION / SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED all
      // carry a session when signed in — any of them counts as authenticated.
      // Only SIGNED_OUT clears the mock flag; a null session on other events
      // (e.g. transient refresh) must NOT log demo users out.
      if (session?.user) login(displayNameFor(session.user));
      else if (event === "SIGNED_OUT") logout();
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [login, logout]);
  return null;
}

/** Live Supabase user for pages (e.g. redirect-away when already signed in). */
export function useSupabaseUser(): { user: User | null; loading: boolean } {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);
  return { user, loading };
}
