"use client";

// Live workspace data for the signed-in user's active business (Phase 4).
// Reads: profiles (own), business_settings, categories, transactions,
// transaction_items, chat_sessions/messages — all via existing RLS.
// Demo/mock-only sessions get empty live rows; demo datasets keep working
// via useMockStore.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useBusiness } from "./business-context";
import {
  fetchBusinessSettings,
  fetchCategories,
  fetchMyProfile,
  fetchTransactions,
  fetchTransactionItems,
} from "@/lib/supabase/workspace-reads";
import type {
  LiveBusinessSettings,
  LiveCategory,
  LiveProfile,
  LiveTransaction,
  LiveTransactionItem,
} from "@/lib/supabase/workspace";

interface WorkspaceState {
  profile: LiveProfile | null;
  settings: LiveBusinessSettings | null;
  categories: LiveCategory[];
  transactions: LiveTransaction[];
  items: LiveTransactionItem[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace outside WorkspaceProvider");
  return ctx;
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { userId, activeBusinessId } = useBusiness();
  const [profile, setProfile] = useState<LiveProfile | null>(null);
  const [settings, setSettings] = useState<LiveBusinessSettings | null>(null);
  const [categories, setCategories] = useState<LiveCategory[]>([]);
  const [transactions, setTransactions] = useState<LiveTransaction[]>([]);
  const [items, setItems] = useState<LiveTransactionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!userId || !activeBusinessId) {
      setProfile(null);
      setSettings(null);
      setCategories([]);
      setTransactions([]);
      setItems([]);
      setError("");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const [p, s, c, t, it] = await Promise.all([
        fetchMyProfile(userId),
        fetchBusinessSettings(activeBusinessId),
        fetchCategories(activeBusinessId),
        fetchTransactions(activeBusinessId),
        // Line items power Top Products qty/revenue + Log Entry suggestions.
        // Empty for new/legacy-header businesses — callers treat missing
        // rows as "qty unknown", never as qty 1. Read-only; no DB changes.
        fetchTransactionItems(activeBusinessId).catch(() => [] as LiveTransactionItem[]),
      ]);
      setProfile(p);
      setSettings(s);
      setCategories(c);
      setTransactions(t);
      setItems(it);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load workspace data.");
    } finally {
      setLoading(false);
    }
  }, [userId, activeBusinessId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<WorkspaceState>(
    () => ({ profile, settings, categories, transactions, items, loading, error, refresh }),
    [profile, settings, categories, transactions, items, loading, error, refresh]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
