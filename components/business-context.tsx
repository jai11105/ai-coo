"use client";

// Live business workspace state (Phase 3).
//
// - Memberships come from business_members for the signed-in Supabase user
//   (RLS-enforced). Demo/mock-only sessions get an empty list.
// - The active business id persists in localStorage; a single membership is
//   auto-selected. Stale ids (no longer a member) are cleared.
// - Knows NOTHING about transactions/ledger/copilot: those stay on mock data.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase/client";
import {
  fetchMyMemberships,
  type LiveBusiness,
  type Membership,
} from "@/lib/supabase/businesses";

const STORAGE_KEY = "aicoo.activeBusinessId";

interface BusinessState {
  userId: string | null;
  memberships: Membership[];
  activeBusinessId: string | null;
  activeBusiness: LiveBusiness | null;
  activeRole: string | null;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  setActive: (id: string) => void;
  clearActive: () => void;
}

const BusinessContext = createContext<BusinessState | null>(null);

export function useBusiness(): BusinessState {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness outside BusinessProvider");
  return ctx;
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  // null = auth state not yet resolved. Membership refresh MUST wait for this,
  // otherwise the first pass runs with userId=null and exits early, and a
  // later SIGNED_IN event can leave loading=true forever (login stuck).
  const [authReady, setAuthReady] = useState(false);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [activeBusinessId, setActiveBusinessId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hydrated, setHydrated] = useState(false);

  // Restore the persisted selection (client only).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setActiveBusinessId(saved);
    } catch {
      /* localStorage unavailable — selection just won't persist */
    }
    setHydrated(true);
  }, []);

  // Track the live Supabase user (demo/mock sessions have none).
  // Both the initial getSession AND the INITIAL_SESSION event mark authRead
  // ready; a failed getSession still resolves ready (offline = signed out).
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user?.id ?? null);
      setAuthReady(true);
    }).catch(() => {
      if (active) {
        setUserId(null);
        setAuthReady(true);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setUserId(session?.user?.id ?? null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!authReady) return;
    if (!userId) {
      setMemberships([]);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const rows = await fetchMyMemberships(userId);
      setMemberships(rows);
      setActiveBusinessId((prev) => {
        if (prev && rows.some((r) => r.business_id === prev)) return prev;
        if (rows.length === 1 && rows[0].business_id) {
          try {
            window.localStorage.setItem(STORAGE_KEY, rows[0].business_id);
          } catch {
            /* localStorage unavailable — selection just won't persist */
          }
          return rows[0].business_id;
        }
        if (prev) {
          try {
            window.localStorage.removeItem(STORAGE_KEY);
          } catch {
            /* localStorage unavailable — nothing to clear */
          }
        }
        return null;
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load your businesses.");
    } finally {
      setLoading(false);
    }
  }, [authReady, userId]);

  useEffect(() => {
    // Wait for BOTH the persisted-selection hydration AND the auth state
    // resolution before the first membership load. This guarantees exactly one
    // authoritative load after login/refresh instead of an early null-user
    // pass that exits and never re-fires.
    if (hydrated && authReady) void refresh();
  }, [hydrated, authReady, refresh]);

  const setActive = useCallback((id: string) => {
    setActiveBusinessId(id);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* localStorage unavailable — selection just won't persist */
    }
  }, []);

  const clearActive = useCallback(() => {
    setActiveBusinessId(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage unavailable — nothing to clear */
    }
  }, []);

  const value = useMemo<BusinessState>(() => {
    const active = memberships.find((m) => m.business_id === activeBusinessId) ?? null;
    return {
      userId,
      memberships,
      activeBusinessId,
      activeBusiness: active?.business ?? null,
      activeRole: active?.role ?? null,
      loading,
      error,
      refresh,
      setActive,
      clearActive,
    };
  }, [userId, memberships, activeBusinessId, loading, error, refresh, setActive, clearActive]);

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>;
}
