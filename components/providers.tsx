"use client";

import { ThemeProvider } from "next-themes";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { SupabaseAuthSync } from "./auth-provider";
import { BusinessProvider } from "./business-context";
import { WorkspaceProvider } from "./workspace-context";
import type {
  DatasetProfile,
  DemoDatasetKey,
  MockCategory,
  MockProduct,
  MockTransaction,
  TransactionType,
} from "@/lib/types";
import {
  DATASET_CATEGORIES,
  DATASET_PRODUCTS,
  DATASET_PROFILES,
  DATASET_TRANSACTIONS,
} from "@/lib/datasets";
import { uid } from "@/lib/utils";

export interface MockSession {
  authenticated: boolean;
  userName: string;
  businessName: string;
  datasetKey: DemoDatasetKey;
  mode: string;
}

interface MockStore {
  session: MockSession;
  profile: DatasetProfile;
  transactions: MockTransaction[];
  categories: MockCategory[];
  products: MockProduct[];
  login: (name?: string) => void;
  logout: () => void;
  setDataset: (key: DemoDatasetKey) => void;
  addTransaction: (t: MockTransaction) => void;
  addCategory: (name: string, type: TransactionType) => boolean;
  addProduct: (p: MockProduct) => boolean;
  updateProfile: (patch: Partial<DatasetProfile>) => void;
}

const MockStoreContext = createContext<MockStore | null>(null);

export function useMockStore(): MockStore {
  const ctx = useContext(MockStoreContext);
  if (!ctx) throw new Error("useMockStore outside provider");
  return ctx;
}

function sortedTxns(txns: MockTransaction[]): MockTransaction[] {
  return [...txns].sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [userName, setUserName] = useState("Owner");
  const [datasetKey, setDatasetKey] = useState<DemoDatasetKey>("meta_demo");
  // Per-dataset user additions — NEVER mixed across datasets.
  const [addedTxns, setAddedTxns] = useState<Record<DemoDatasetKey, MockTransaction[]>>({
    meta_demo: [],
    sample_business_2: [],
  });
  const [addedCats, setAddedCats] = useState<Record<DemoDatasetKey, MockCategory[]>>({
    meta_demo: [],
    sample_business_2: [],
  });
  const [addedProducts, setAddedProducts] = useState<Record<DemoDatasetKey, MockProduct[]>>({
    meta_demo: [],
    sample_business_2: [],
  });
  const [profilePatch, setProfilePatch] = useState<Record<DemoDatasetKey, Partial<DatasetProfile>>>({
    meta_demo: {},
    sample_business_2: {},
  });

  const login = useCallback((name?: string) => {
    if (name) setUserName(name);
    setAuthenticated(true);
  }, []);
  const logout = useCallback(() => setAuthenticated(false), []);
  const setDataset = useCallback((key: DemoDatasetKey) => setDatasetKey(key), []);

  const addTransaction = useCallback(
    (t: MockTransaction) => {
      const row = { ...t, id: t.id || uid("txn") };
      setAddedTxns((prev) => ({ ...prev, [datasetKey]: [row, ...prev[datasetKey]] }));
    },
    [datasetKey]
  );

  const addCategory = useCallback(
    (name: string, type: TransactionType) => {
      const clean = name.trim();
      if (!clean) return false;
      const exists = [...DATASET_CATEGORIES[datasetKey], ...addedCats[datasetKey]].some(
        (c) => c.name.toLowerCase() === clean.toLowerCase() && c.type === type
      );
      if (exists) return false;
      setAddedCats((prev) => ({ ...prev, [datasetKey]: [...prev[datasetKey], { name: clean, type }] }));
      return true;
    },
    [datasetKey, addedCats]
  );

  const addProduct = useCallback(
    (p: MockProduct) => {
      const clean = p.name.trim();
      if (!clean) return false;
      const exists = [...DATASET_PRODUCTS[datasetKey], ...addedProducts[datasetKey]].some(
        (x) => x.name.toLowerCase() === clean.toLowerCase()
      );
      if (exists) return false;
      setAddedProducts((prev) => ({ ...prev, [datasetKey]: [...prev[datasetKey], { ...p, name: clean }] }));
      return true;
    },
    [datasetKey, addedProducts]
  );

  const updateProfile = useCallback(
    (patch: Partial<DatasetProfile>) => {
      setProfilePatch((prev) => ({ ...prev, [datasetKey]: { ...prev[datasetKey], ...patch } }));
    },
    [datasetKey]
  );

  const value = useMemo<MockStore>(() => {
    const base = DATASET_PROFILES[datasetKey];
    const profile: DatasetProfile = { ...base, ...profilePatch[datasetKey] };
    return {
      session: {
        authenticated,
        userName,
        businessName: profile.name,
        datasetKey,
        mode: authenticated ? `Demo mock · ${datasetKey}` : "Signed out (mock)",
      },
      profile,
      transactions: sortedTxns([...addedTxns[datasetKey], ...DATASET_TRANSACTIONS[datasetKey]]),
      categories: [...DATASET_CATEGORIES[datasetKey], ...addedCats[datasetKey]],
      products: [...DATASET_PRODUCTS[datasetKey], ...addedProducts[datasetKey]],
      login,
      logout,
      setDataset,
      addTransaction,
      addCategory,
      addProduct,
      updateProfile,
    };
  }, [authenticated, userName, datasetKey, addedTxns, addedCats, addedProducts, profilePatch, login, logout, setDataset, addTransaction, addCategory, addProduct, updateProfile]);

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <MockStoreContext.Provider value={value}>
        <SupabaseAuthSync />
        <BusinessProvider>
          <WorkspaceProvider>
            {children}
          </WorkspaceProvider>
        </BusinessProvider>
      </MockStoreContext.Provider>
    </ThemeProvider>
  );
}
