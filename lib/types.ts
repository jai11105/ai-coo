export type TransactionType = "sale" | "purchase" | "expense";
export type ActivityScope = "All" | "Sales" | "Purchase" | "Expense";
export type DatePreset = "Today" | "Yesterday" | "This Week" | "This Month" | "Last Month" | "Custom";
export type ThemeMode = "light" | "dark" | "system";
export type DemoDatasetKey = "meta_demo" | "sample_business_2";

export interface MockKpi {
  key: string;
  label: string;
  valueMinor: number;
  currency: string;
  // Null = undefined percentage (previous period was zero/empty).
  // UI must render "New" or "—", never a fabricated +100%.
  deltaPct: number | null;
  hint: string;
}

export interface MockTransaction {
  id: string;
  type: TransactionType;
  // ISO datetime "YYYY-MM-DDTHH:MM" in business local time (mock).
  date: string;
  category: string;
  product?: string;
  qty?: number;
  // Sale: selling price / unit. Purchase: unit cost. Expense: unused.
  unitPriceMinor?: number;
  // Sale only: per-unit buying cost (COGS basis).
  buyingCostMinor?: number;
  // Sale only: total COGS = qty * buyingCostMinor.
  buyingCostTotalMinor?: number;
  party: string;
  // Authoritative line total = qty * unitPriceMinor (or entered amount).
  amountMinor: number;
  currency: string;
  paymentMethod: string;
  // Slice 3: sales channel when known (live `transactions.channel`).
  // Optional — absent means "no channel recorded". Never defaulted or
  // invented; tools report "Unspecified/missing" honestly. Payment method
  // stays separate (paymentMethod) and is never presented as a channel.
  channel?: string;
  reference: string;
  notes?: string;
}

export interface MockCategory {
  name: string;
  type: TransactionType;
}

export interface MockProduct {
  name: string;
  category: string;
  salePriceMinor: number;
  costMinor: number;
  type: TransactionType;
}

export interface DateRangeSel {
  start: string; // yyyy-mm-dd inclusive
  end: string; // yyyy-mm-dd inclusive
}

export type CompareMode = "Previous Period" | "Same Period Last Year";

export interface DatasetProfile extends MockBusinessProfile {
  datasetKey: DemoDatasetKey;
  displayName: string;
}

export interface MockDirective {
  id: string;
  rank: number;
  title: string;
  impact: "High" | "Medium" | "Low";
  effort: "Low" | "Medium" | "High";
  summary: string;
  evidence: string[];
  action: string;
}

export interface MockChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  evidence?: string[];
  timestamp: string;
  /** Slice 8: persisted assistant message id for trusted TTS (live only). */
  assistantMessageId?: string | null;
  sessionId?: string | null;
}

export interface MockBusinessProfile {
  name: string;
  legalName: string;
  industry: string;
  businessType: string;
  countryCode: string;
  regionCode: string;
  currencyCode: string;
  timezone: string;
  locale: string;
  taxJurisdiction: string;
  isGstRegistered: boolean;
  financialYearStart: string;
}
