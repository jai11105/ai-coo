import type {
  MockBusinessProfile,
  MockChatMessage,
  MockDirective,
  MockKpi,
  MockTransaction,
} from "./types";

// Phase 1 realistic mock data. Clearly separated from future backend layer.
// No Supabase / API / AI calls here. Replaced by backend in Phase 2+.

export const DEMO_DATASETS = [
  {
    key: "meta_demo",
    name: "Meta Demo — Sharma General Store",
    description: "Curated retail FMCG business with seasonal and peak-hour patterns.",
    highlights: ["Seasonal FMCG demand", "Peak-hour sales", "GST-registered (IN)"],
  },
  {
    key: "sample_business_2",
    name: "Sample Business 2 — Kaveri Textiles",
    description: "Alternative business with distinct cost and margin structures.",
    highlights: ["Apparel margins", "Wholesale purchases", "Multi-category expenses"],
  },
] as const;

export function getMockKpis(scope: string): MockKpi[] {
  const base: Record<string, MockKpi[]> = {
    All: [
      { key: "revenue", label: "Revenue", valueMinor: 4825000, currency: "INR", deltaPct: 12.4, hint: "vs previous period" },
      { key: "cogs", label: "COGS", valueMinor: 2613000, currency: "INR", deltaPct: 8.1, hint: "inventory cost of goods sold" },
      { key: "gross", label: "Gross Profit", valueMinor: 2212000, currency: "INR", deltaPct: 18.2, hint: "Revenue minus COGS" },
      { key: "expenses", label: "Expenses", valueMinor: 684000, currency: "INR", deltaPct: -3.6, hint: "overhead, non-COGS" },
      { key: "net", label: "Net Profit", valueMinor: 1528000, currency: "INR", deltaPct: 24.7, hint: "Gross minus Expenses" },
    ],
    Sales: [
      { key: "revenue", label: "Revenue", valueMinor: 4825000, currency: "INR", deltaPct: 12.4, hint: "scoped: Sales only" },
      { key: "cogs", label: "COGS", valueMinor: 2613000, currency: "INR", deltaPct: 8.1, hint: "scoped: Sales only" },
      { key: "gross", label: "Gross Profit", valueMinor: 2212000, currency: "INR", deltaPct: 18.2, hint: "scoped: Sales only" },
      { key: "expenses", label: "Expenses", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "excluded by slicer" },
      { key: "net", label: "Net Profit", valueMinor: 2212000, currency: "INR", deltaPct: 18.2, hint: "scoped view" },
    ],
    Purchase: [
      { key: "revenue", label: "Revenue", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "excluded by slicer" },
      { key: "cogs", label: "COGS", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "COGS lives on Sales" },
      { key: "gross", label: "Gross Profit", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "excluded by slicer" },
      { key: "expenses", label: "Purchases", valueMinor: 1985000, currency: "INR", deltaPct: 6.2, hint: "stock acquisitions" },
      { key: "net", label: "Net Profit", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "scoped view" },
    ],
    Expense: [
      { key: "revenue", label: "Revenue", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "excluded by slicer" },
      { key: "cogs", label: "COGS", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "excluded by slicer" },
      { key: "gross", label: "Gross Profit", valueMinor: 0, currency: "INR", deltaPct: 0, hint: "excluded by slicer" },
      { key: "expenses", label: "Expenses", valueMinor: 684000, currency: "INR", deltaPct: -3.6, hint: "scoped: Expense only" },
      { key: "net", label: "Net Profit", valueMinor: -684000, currency: "INR", deltaPct: -3.6, hint: "scoped view" },
    ],
  };
  return base[scope] ?? base.All;
}

// __PART2__
export const MOCK_TRANSACTIONS: MockTransaction[] = [
  { id: "txn_001", type: "sale", date: "2026-10-30 18:42", category: "Groceries", party: "Walk-in customer", amountMinor: 245000, currency: "INR", paymentMethod: "UPI", reference: "SALE-10421", notes: "Evening peak-hour basket" },
  { id: "txn_002", type: "sale", date: "2026-10-30 12:15", category: "Beverages", party: "Walk-in customer", amountMinor: 89500, currency: "INR", paymentMethod: "Cash", reference: "SALE-10420" },
  { id: "txn_003", type: "purchase", date: "2026-10-29 10:00", category: "Stock — FMCG", party: "Metro Distributors", amountMinor: 5200000, currency: "INR", paymentMethod: "Bank Transfer", reference: "PUR-20311", notes: "Monthly staples restock" },
  { id: "txn_004", type: "expense", date: "2026-10-28 09:30", category: "Rent", party: "Landlord", amountMinor: 2500000, currency: "INR", paymentMethod: "Bank Transfer", reference: "EXP-30112" },
  { id: "txn_005", type: "expense", date: "2026-10-27 17:20", category: "Electricity", party: "BESCOM", amountMinor: 184500, currency: "INR", paymentMethod: "UPI", reference: "EXP-30111" },
  { id: "txn_006", type: "sale", date: "2026-10-27 19:05", category: "Personal Care", party: "Walk-in customer", amountMinor: 132000, currency: "INR", paymentMethod: "Card", reference: "SALE-10419" },
  { id: "txn_007", type: "purchase", date: "2026-10-26 11:45", category: "Stock — Dairy", party: "Nandini Dairy", amountMinor: 1860000, currency: "INR", paymentMethod: "UPI", reference: "PUR-20310" },
  { id: "txn_008", type: "expense", date: "2026-10-25 14:00", category: "Staff Wages", party: "Store staff", amountMinor: 3200000, currency: "INR", paymentMethod: "Bank Transfer", reference: "EXP-30110" },
];

export const MOCK_DIRECTIVES: MockDirective[] = [
  { id: "dir_1", rank: 1, title: "Restock high-velocity staples before weekend peak", impact: "High", effort: "Low", summary: "Rice, atta and edible oil drove 38% of evening revenue; stock cover under 4 days.", evidence: ["Evening sales +22% WoW", "Rice cover 3.2 days", "Staples margin 41%"], action: "Raise PO for 2x weekly staples volume today." },
  { id: "dir_2", rank: 2, title: "Shift dairy order to early-morning slot", impact: "Medium", effort: "Low", summary: "Late dairy deliveries correlate with spoilage write-offs twice this month.", evidence: ["Spoilage on late-delivery days", "On-time days: zero spoilage"], action: "Move dairy delivery to 6:30 AM slot." },
  { id: "dir_3", rank: 3, title: "Review electricity cost trend", impact: "Medium", effort: "Medium", summary: "Power cost up 14% MoM; new freezer added Oct 12 is likely driver.", evidence: ["Oct power vs Sep +14%", "New freezer Oct 12"], action: "Audit freezer thermostat schedule." },
  { id: "dir_4", rank: 4, title: "Promote slow-moving personal care bundle", impact: "Medium", effort: "Low", summary: "Personal care turns at 0.6x vs store 2.1x; bundling lifted trial 18% before.", evidence: ["Cover: 47 days", "Last bundle +18% units"], action: "Run 2-week shampoo + soap combo." },
  { id: "dir_5", rank: 5, title: "Negotiate distributor credit terms", impact: "Low", effort: "Medium", summary: "60% of purchases prepaid while cash converts in 9 days.", evidence: ["Prepaid share 60%", "Cash conversion 9 days"], action: "Ask for 7-day staples credit." },
];

export const MOCK_CHAT_SEED: MockChatMessage[] = [
  { id: "m1", role: "user", content: "Why did profit spike this week?", timestamp: "10:42" },
  { id: "m2", role: "assistant", content: "Mock answer (Phase 1 UI only, no AI call): Net profit is up on strong evening FMCG sales and flat overhead. Production answers will cite deterministic Supabase evidence.", evidence: ["Revenue +12.4%", "Evening sales +22% WoW", "Expenses -3.6%"], timestamp: "10:42" },
];

export const MOCK_PROFILE: MockBusinessProfile = {
  name: "Sharma General Store",
  legalName: "Sharma General Store Pvt. Ltd.",
  industry: "Retail — FMCG",
  businessType: "retail",
  countryCode: "IN",
  regionCode: "KA",
  currencyCode: "INR",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  taxJurisdiction: "IN",
  isGstRegistered: true,
  financialYearStart: "April",
};

