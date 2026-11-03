import type {
  DatasetProfile,
  DemoDatasetKey,
  MockCategory,
  MockProduct,
  MockTransaction,
  TransactionType,
} from "./types";

// ---------------------------------------------------------------------------
// Phase 1 per-dataset mock seeds. Two isolated datasets; switching datasets
// must never mix data. Replaced by Supabase in Phase 2+.
// Dates are ISO "YYYY-MM-DDTHH:MM" business-local (mock). "Today" is anchored
// to DATASET_ANCHOR so date presets always filter deterministically.
// ---------------------------------------------------------------------------

export const DATASET_ANCHOR: Record<DemoDatasetKey, string> = {
  meta_demo: "2026-10-31",
  sample_business_2: "2026-10-31",
};

export const DATASET_PROFILES: Record<DemoDatasetKey, DatasetProfile> = {
  meta_demo: {
    datasetKey: "meta_demo",
    displayName: "Sharma General Store (Meta Demo)",
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
  },
  sample_business_2: {
    datasetKey: "sample_business_2",
    displayName: "Kaveri Textiles (Sample 2)",
    name: "Kaveri Textiles",
    legalName: "Kaveri Textiles",
    industry: "Retail — Apparel",
    businessType: "retail",
    countryCode: "IN",
    regionCode: "TN",
    currencyCode: "INR",
    timezone: "Asia/Kolkata",
    locale: "en-IN",
    taxJurisdiction: "IN",
    isGstRegistered: true,
    financialYearStart: "April",
  },
};

export const DATASET_CATEGORIES: Record<DemoDatasetKey, MockCategory[]> = {
  meta_demo: [
    { name: "Groceries", type: "sale" },
    { name: "Beverages", type: "sale" },
    { name: "Dairy", type: "sale" },
    { name: "Snacks", type: "sale" },
    { name: "Personal Care", type: "sale" },
    { name: "Stock — FMCG", type: "purchase" },
    { name: "Stock — Dairy", type: "purchase" },
    { name: "Stock — Beverages", type: "purchase" },
    { name: "Rent", type: "expense" },
    { name: "Electricity", type: "expense" },
    { name: "Staff Wages", type: "expense" },
    { name: "Transport", type: "expense" },
    { name: "Packaging", type: "expense" },
  ],
  sample_business_2: [
    { name: "Sarees", type: "sale" },
    { name: "Kurtis", type: "sale" },
    { name: "Home Furnishing", type: "sale" },
    { name: "Stock — Fabric", type: "purchase" },
    { name: "Stock — Garments", type: "purchase" },
    { name: "Rent", type: "expense" },
    { name: "Electricity", type: "expense" },
    { name: "Staff Wages", type: "expense" },
    { name: "Tailoring Jobwork", type: "expense" },
  ],
};

export const DATASET_PRODUCTS: Record<DemoDatasetKey, MockProduct[]> = {
  meta_demo: [
    { name: "Basmati Rice 5kg", category: "Groceries", salePriceMinor: 48200, costMinor: 28500, type: "sale" },
    { name: "Sunflower Oil 1L", category: "Groceries", salePriceMinor: 36700, costMinor: 23800, type: "sale" },
    { name: "Atta 10kg", category: "Groceries", salePriceMinor: 31400, costMinor: 18900, type: "sale" },
    { name: "Coca-Cola 750ml", category: "Beverages", salePriceMinor: 4000, costMinor: 2700, type: "sale" },
    { name: "Amul Milk 1L", category: "Dairy", salePriceMinor: 6600, costMinor: 5400, type: "sale" },
    { name: "Parle-G Biscuits", category: "Snacks", salePriceMinor: 2500, costMinor: 1600, type: "sale" },
    { name: "Surf Excel 1kg", category: "Personal Care", salePriceMinor: 11800, costMinor: 7900, type: "sale" },
  ],
  sample_business_2: [
    { name: "Cotton Saree", category: "Sarees", salePriceMinor: 249900, costMinor: 142000, type: "sale" },
    { name: "Silk Saree", category: "Sarees", salePriceMinor: 549900, costMinor: 318000, type: "sale" },
    { name: "Kurti — Floral", category: "Kurtis", salePriceMinor: 89900, costMinor: 47000, type: "sale" },
    { name: "Bedsheet Set", category: "Home Furnishing", salePriceMinor: 129900, costMinor: 68000, type: "sale" },
    { name: "Fabric Roll — Cotton", category: "Stock — Fabric", salePriceMinor: 0, costMinor: 85000, type: "purchase" },
  ],
};

// Compact txn builder. amountMinor = qty * unit. Sale COGS = qty * cost.
// Expense: pass qty 1 and unit = amount.
// __TXNS_A__
type Tb = {
  id: string;
  type: TransactionType;
  date: string;
  category: string;
  product?: string;
  qty?: number;
  unit?: number;
  cost?: number;
  party: string;
  method: string;
  ref: string;
  notes?: string;
};

function build(list: Tb[]): MockTransaction[] {
  return list.map((t) => {
    const qty = t.qty ?? 1;
    const unit = t.unit ?? 0;
    const amountMinor = qty * unit;
    return {
      id: t.id,
      type: t.type,
      date: t.date,
      category: t.category,
      product: t.product,
      qty: t.type === "expense" ? undefined : qty,
      unitPriceMinor: t.type === "expense" ? undefined : unit,
      buyingCostMinor: t.type === "sale" ? t.cost ?? undefined : undefined,
      buyingCostTotalMinor: t.type === "sale" ? qty * (t.cost ?? 0) : undefined,
      party: t.party,
      amountMinor,
      currency: "INR",
      paymentMethod: t.method,
      reference: t.ref,
      notes: t.notes,
    };
  });
}

export const DATASET_TRANSACTIONS: Record<DemoDatasetKey, MockTransaction[]> = {
  meta_demo: build([
    { id: "m_001", type: "sale", date: "2026-10-31T19:20", category: "Groceries", product: "Basmati Rice 5kg", qty: 6, unit: 48200, cost: 28500, party: "Walk-in", method: "UPI", ref: "SALE-10501", notes: "Evening peak" },
    { id: "m_002", type: "sale", date: "2026-10-31T12:40", category: "Beverages", product: "Coca-Cola 750ml", qty: 24, unit: 4000, cost: 2700, party: "Walk-in", method: "Cash", ref: "SALE-10500" },
    { id: "m_003", type: "sale", date: "2026-10-31T10:15", category: "Dairy", product: "Amul Milk 1L", qty: 40, unit: 6600, cost: 5400, party: "Walk-in", method: "UPI", ref: "SALE-10499" },
    { id: "m_004", type: "sale", date: "2026-10-30T18:42", category: "Groceries", product: "Sunflower Oil 1L", qty: 9, unit: 36700, cost: 23800, party: "Walk-in", method: "UPI", ref: "SALE-10498" },
    { id: "m_005", type: "sale", date: "2026-10-30T12:15", category: "Snacks", product: "Parle-G Biscuits", qty: 36, unit: 2500, cost: 1600, party: "Walk-in", method: "Cash", ref: "SALE-10497" },
    { id: "m_006", type: "sale", date: "2026-10-29T19:05", category: "Personal Care", product: "Surf Excel 1kg", qty: 7, unit: 11800, cost: 7900, party: "Phone order", method: "Card", ref: "SALE-10496" },
    { id: "m_007", type: "sale", date: "2026-10-28T18:30", category: "Groceries", product: "Atta 10kg", qty: 11, unit: 31400, cost: 18900, party: "Walk-in", method: "UPI", ref: "SALE-10495" },
    { id: "m_008", type: "sale", date: "2026-10-27T20:12", category: "Groceries", product: "Basmati Rice 5kg", qty: 8, unit: 48200, cost: 28500, party: "Phone order", method: "UPI", ref: "SALE-10494" },
    { id: "m_009", type: "sale", date: "2026-10-26T13:40", category: "Beverages", product: "Coca-Cola 750ml", qty: 30, unit: 4000, cost: 2700, party: "Walk-in", method: "Cash", ref: "SALE-10493" },
    { id: "m_010", type: "sale", date: "2026-10-25T19:44", category: "Groceries", product: "Sunflower Oil 1L", qty: 12, unit: 36700, cost: 23800, party: "Walk-in", method: "Card", ref: "SALE-10492" },
    { id: "m_011", type: "sale", date: "2026-10-24T11:20", category: "Dairy", product: "Amul Milk 1L", qty: 48, unit: 6600, cost: 5400, party: "Walk-in", method: "UPI", ref: "SALE-10491" },
    { id: "m_012", type: "sale", date: "2026-10-22T18:10", category: "Groceries", product: "Basmati Rice 5kg", qty: 10, unit: 48200, cost: 28500, party: "Walk-in", method: "UPI", ref: "SALE-10490" },
    { id: "m_013", type: "sale", date: "2026-10-19T12:05", category: "Snacks", product: "Parle-G Biscuits", qty: 44, unit: 2500, cost: 1600, party: "Walk-in", method: "Cash", ref: "SALE-10489" },
    { id: "m_014", type: "sale", date: "2026-10-15T19:30", category: "Groceries", product: "Atta 10kg", qty: 14, unit: 31400, cost: 18900, party: "Walk-in", method: "UPI", ref: "SALE-10488" },
    { id: "m_015", type: "sale", date: "2026-10-10T13:15", category: "Beverages", product: "Coca-Cola 750ml", qty: 36, unit: 4000, cost: 2700, party: "Walk-in", method: "Cash", ref: "SALE-10487" },
    { id: "m_016", type: "sale", date: "2026-10-05T18:50", category: "Groceries", product: "Basmati Rice 5kg", qty: 9, unit: 48200, cost: 28500, party: "Phone order", method: "UPI", ref: "SALE-10486" },
    { id: "m_017", type: "sale", date: "2026-10-02T12:30", category: "Personal Care", product: "Surf Excel 1kg", qty: 6, unit: 11800, cost: 7900, party: "Walk-in", method: "Card", ref: "SALE-10485" },
    { id: "m_018", type: "sale", date: "2026-09-28T19:12", category: "Groceries", product: "Sunflower Oil 1L", qty: 10, unit: 36700, cost: 23800, party: "Walk-in", method: "UPI", ref: "SALE-10484" },
    { id: "m_019", type: "sale", date: "2026-09-25T11:45", category: "Dairy", product: "Amul Milk 1L", qty: 52, unit: 6600, cost: 5400, party: "Walk-in", method: "Cash", ref: "SALE-10483" },
    { id: "m_020", type: "sale", date: "2026-09-20T18:25", category: "Snacks", product: "Parle-G Biscuits", qty: 40, unit: 2500, cost: 1600, party: "Walk-in", method: "UPI", ref: "SALE-10482" },
// __TXNS_B__
    { id: "m_021", type: "purchase", date: "2026-10-29T10:00", category: "Stock — FMCG", product: "Basmati Rice 5kg", qty: 120, unit: 28500, party: "Metro Distributors", method: "Bank Transfer", ref: "PUR-20311", notes: "Monthly staples restock" },
    { id: "m_022", type: "purchase", date: "2026-10-26T11:45", category: "Stock — Dairy", product: "Amul Milk 1L", qty: 400, unit: 5400, party: "Nandini Dairy", method: "UPI", ref: "PUR-20310" },
    { id: "m_023", type: "purchase", date: "2026-10-21T09:30", category: "Stock — Beverages", product: "Coca-Cola 750ml", qty: 600, unit: 2700, party: "Metro Distributors", method: "Bank Transfer", ref: "PUR-20309" },
    { id: "m_024", type: "purchase", date: "2026-10-12T10:20", category: "Stock — FMCG", product: "Atta 10kg", qty: 150, unit: 18900, party: "Metro Distributors", method: "Bank Transfer", ref: "PUR-20308" },
    { id: "m_025", type: "purchase", date: "2026-10-03T11:00", category: "Stock — FMCG", product: "Sunflower Oil 1L", qty: 140, unit: 23800, party: "Metro Distributors", method: "Bank Transfer", ref: "PUR-20307" },
    { id: "m_026", type: "purchase", date: "2026-09-22T10:40", category: "Stock — Dairy", product: "Amul Milk 1L", qty: 380, unit: 5400, party: "Nandini Dairy", method: "UPI", ref: "PUR-20306" },
    { id: "m_027", type: "expense", date: "2026-10-28T09:30", category: "Rent", qty: 1, unit: 2500000, party: "Landlord", method: "Bank Transfer", ref: "EXP-30112" },
    { id: "m_028", type: "expense", date: "2026-10-27T17:20", category: "Electricity", qty: 1, unit: 184500, party: "BESCOM", method: "UPI", ref: "EXP-30111" },
    { id: "m_029", type: "expense", date: "2026-10-25T14:00", category: "Staff Wages", qty: 1, unit: 3200000, party: "Store staff", method: "Bank Transfer", ref: "EXP-30110" },
    { id: "m_030", type: "expense", date: "2026-10-18T16:00", category: "Transport", qty: 1, unit: 325000, party: "Local tempo", method: "Cash", ref: "EXP-30109" },
    { id: "m_031", type: "expense", date: "2026-10-08T11:30", category: "Packaging", qty: 1, unit: 148000, party: "Pack supplier", method: "UPI", ref: "EXP-30108" },
    { id: "m_032", type: "expense", date: "2026-09-28T09:30", category: "Rent", qty: 1, unit: 2500000, party: "Landlord", method: "Bank Transfer", ref: "EXP-30107" },
    { id: "m_033", type: "expense", date: "2026-09-26T10:00", category: "Electricity", qty: 1, unit: 161800, party: "BESCOM", method: "UPI", ref: "EXP-30106" },
  ]),
  sample_business_2: build([
    { id: "s_001", type: "sale", date: "2026-10-31T18:05", category: "Sarees", product: "Cotton Saree", qty: 4, unit: 249900, cost: 142000, party: "Walk-in", method: "UPI", ref: "TXS-20101" },
    { id: "s_002", type: "sale", date: "2026-10-30T17:40", category: "Kurtis", product: "Kurti — Floral", qty: 9, unit: 89900, cost: 47000, party: "Walk-in", method: "Card", ref: "TXS-20100" },
    { id: "s_003", type: "sale", date: "2026-10-29T13:10", category: "Sarees", product: "Silk Saree", qty: 2, unit: 549900, cost: 318000, party: "Wedding order", method: "Bank Transfer", ref: "TXS-20099" },
    { id: "s_004", type: "sale", date: "2026-10-27T19:25", category: "Home Furnishing", product: "Bedsheet Set", qty: 6, unit: 129900, cost: 68000, party: "Walk-in", method: "UPI", ref: "TXS-20098" },
    { id: "s_005", type: "sale", date: "2026-10-24T12:50", category: "Sarees", product: "Cotton Saree", qty: 5, unit: 249900, cost: 142000, party: "Walk-in", method: "Cash", ref: "TXS-20097" },
    { id: "s_006", type: "sale", date: "2026-10-20T16:30", category: "Kurtis", product: "Kurti — Floral", qty: 11, unit: 89900, cost: 47000, party: "Walk-in", method: "UPI", ref: "TXS-20096" },
    { id: "s_007", type: "sale", date: "2026-10-15T18:15", category: "Sarees", product: "Silk Saree", qty: 3, unit: 549900, cost: 318000, party: "Festive buyer", method: "Card", ref: "TXS-20095" },
    { id: "s_008", type: "sale", date: "2026-10-09T14:20", category: "Home Furnishing", product: "Bedsheet Set", qty: 8, unit: 129900, cost: 68000, party: "Walk-in", method: "UPI", ref: "TXS-20094" },
    { id: "s_009", type: "sale", date: "2026-10-03T11:35", category: "Kurtis", product: "Kurti — Floral", qty: 7, unit: 89900, cost: 47000, party: "Walk-in", method: "Cash", ref: "TXS-20093" },
    { id: "s_010", type: "sale", date: "2026-09-27T17:55", category: "Sarees", product: "Cotton Saree", qty: 6, unit: 249900, cost: 142000, party: "Walk-in", method: "UPI", ref: "TXS-20092" },
    { id: "s_011", type: "purchase", date: "2026-10-22T10:30", category: "Stock — Fabric", product: "Fabric Roll — Cotton", qty: 60, unit: 85000, party: "Erode Mills", method: "Bank Transfer", ref: "TXP-10105" },
    { id: "s_012", type: "purchase", date: "2026-10-11T09:45", category: "Stock — Garments", product: "Kurti — Floral", qty: 120, unit: 47000, party: "Tiruppur Garments", method: "Bank Transfer", ref: "TXP-10104" },
    { id: "s_013", type: "purchase", date: "2026-10-02T10:15", category: "Stock — Garments", product: "Cotton Saree", qty: 80, unit: 142000, party: "Kanchipuram Weavers", method: "Bank Transfer", ref: "TXP-10103" },
    { id: "s_014", type: "purchase", date: "2026-09-24T11:00", category: "Stock — Fabric", product: "Fabric Roll — Cotton", qty: 50, unit: 85000, party: "Erode Mills", method: "Bank Transfer", ref: "TXP-10102" },
    { id: "s_015", type: "expense", date: "2026-10-28T09:30", category: "Rent", qty: 1, unit: 3200000, party: "Landlord", method: "Bank Transfer", ref: "TXE-50108" },
    { id: "s_016", type: "expense", date: "2026-10-25T14:00", category: "Staff Wages", qty: 1, unit: 4100000, party: "Store staff", method: "Bank Transfer", ref: "TXE-50107" },
    { id: "s_017", type: "expense", date: "2026-10-19T15:30", category: "Tailoring Jobwork", qty: 1, unit: 486000, party: "Jobwork unit", method: "UPI", ref: "TXE-50106" },
    { id: "s_018", type: "expense", date: "2026-10-06T12:00", category: "Electricity", qty: 1, unit: 212000, party: "TANGEDCO", method: "UPI", ref: "TXE-50105" },
    { id: "s_019", type: "expense", date: "2026-09-28T09:30", category: "Rent", qty: 1, unit: 3200000, party: "Landlord", method: "Bank Transfer", ref: "TXE-50104" },
  ]),
};

// Sorted newest-first for ledger display (per-dataset copy).