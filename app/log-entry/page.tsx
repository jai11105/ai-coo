"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useBusiness } from "@/components/business-context";
import { useMockStore } from "@/components/providers";
import { VoiceDraftReview } from "@/components/voice-draft-review";
import { VoiceEntryButton } from "@/components/voice-entry-button";
import { useWorkspace } from "@/components/workspace-context";
import type { MockProduct, MockTransaction, TransactionType } from "@/lib/types";
import type { VoiceDraft } from "@/lib/voice-entry";
import { createLiveCategory, createLiveTransaction } from "@/lib/supabase/workspace-writes";
import { fetchTransactionItems } from "@/lib/supabase/workspace-reads";
import { cx, formatMoney, uid } from "@/lib/utils";

const TABS: { key: TransactionType; label: string; hint: string }[] = [
  { key: "sale", label: "Sale", hint: "Revenue + COGS" },
  { key: "purchase", label: "Purchase", hint: "Stock acquisition" },
  { key: "expense", label: "Expense", hint: "Overhead" },
];

function toMinor(rupees: string): number {
  const v = parseFloat(rupees);
  if (!isFinite(v) || v < 0) return 0;
  return Math.round(v * 100);
}

export default function LogEntryPage() {
  const router = useRouter();
  const { profile: mockProfile, categories: mockCats, products: mockProds, addTransaction, addCategory, addProduct } = useMockStore();
  const { userId, activeBusiness, activeBusinessId, activeRole } = useBusiness();
  const { categories: liveCats, refresh } = useWorkspace();

  // Live for signed-in workspace; demo/mock sessions keep isolated datasets.
  const isLive = Boolean(userId && activeBusinessId);
  const canWriteLive = isLive && (activeRole === "owner" || activeRole === "admin" || activeRole === "editor");
  const profile = isLive && activeBusiness
    ? { ...mockProfile, name: activeBusiness.name, currencyCode: activeBusiness.currency_code }
    : mockProfile;
  // Live categories (exact DB rows, genuine empty) + live item-name suggestions.
  // No hardcoded categories/products when live; no mock leakage into live mode.
  const liveByType = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    for (const c of liveCats) map.set(`${c.transaction_type}:${c.name.toLowerCase()}`, { id: c.id, name: c.name });
    return map;
  }, [liveCats]);
  const categories = useMemo(() => {
    if (!isLive) return mockCats;
    // Live: exact categories rows only; genuine empty when none (no hardcoded fallback).
    return liveCats.map((c) => ({ name: c.name, type: c.transaction_type as TransactionType }));
  }, [isLive, mockCats, liveCats]);
  const [tab, setTab] = useState<TransactionType>("sale");
  const [review, setReview] = useState<MockTransaction | null>(null);
  const [saved, setSaved] = useState("");
  // Voice entry draft (review/edit/confirm only — never auto-saved).
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft | null>(null);
  const [voiceErr, setVoiceErr] = useState("");
  const [voiceSaving, setVoiceSaving] = useState(false);
  // Voice-draft editable fields (initialized from the draft, fully editable).
  const [vType, setVType] = useState<TransactionType>("sale");
  const [vDate, setVDate] = useState("");
  const [vDesc, setVDesc] = useState("");
  const [vCategory, setVCategory] = useState("");
  const [vCounterparty, setVCounterparty] = useState("");
  const [vChannel, setVChannel] = useState("");
  const [vMethod, setVMethod] = useState("");
  const [vItem, setVItem] = useState("");
  const [vQty, setVQty] = useState("");
  const [vSell, setVSell] = useState("");
  const [vBuy, setVBuy] = useState("");
  const [vAmount, setVAmount] = useState("");
  // Live has NO products table (verified): item-name suggestions derive ONLY
  // from saved transaction_items for THIS business (fetched live, newest
  // first). Hardcoded/mock seeds are never shown in live mode; an empty
  // business honestly shows an empty selector with a free-text fallback.
  // "+ Product" in live mode is draft-only: it fills the current form and the
  // name persists via transaction_items.item_name on save — it does NOT
  // create a persistent catalogue entry, so it will not reappear as a
  // selector option after reload unless that item was saved in a transaction.
  const [liveItems, setLiveItems] = useState<{ name: string; salePriceMinor: number; costMinor: number }[]>([]);
  useEffect(() => {
    let active = true;
    if (!isLive || !activeBusinessId) {
      setLiveItems([]);
      return () => { active = false; };
    }
    fetchTransactionItems(activeBusinessId)
      .then((rows) => {
        if (!active) return;
        const byName = new Map<string, { name: string; salePriceMinor: number; costMinor: number }>();
        for (const r of rows) {
          const name = (r.item_name ?? "").trim();
          if (!name || byName.has(name.toLowerCase())) continue;
          byName.set(name.toLowerCase(), {
            name,
            salePriceMinor: r.unit_selling_price_minor ?? r.line_total_minor ?? 0,
            costMinor: r.unit_buying_cost_minor ?? 0,
          });
        }
        setLiveItems(Array.from(byName.values()).slice(0, 50));
      })
      .catch(() => {
        if (active) setLiveItems([]);
      });
    return () => { active = false; };
  }, [isLive, activeBusinessId, saved]);
  const products = useMemo(() => {
    if (!isLive) return mockProds;
    // No catalogue table: suggestions only, never persisted as masters.
    return liveItems.map((p) => ({
      name: p.name,
      category: "",
      salePriceMinor: p.salePriceMinor,
      costMinor: p.costMinor,
      type: tab,
    }));
  }, [isLive, mockProds, liveItems, tab]);

  // Sale state
  const [sProduct, setSProduct] = useState("");
  const [sQty, setSQty] = useState("2");
  const [sPrice, setSPrice] = useState("");
  const [sCost, setSCost] = useState("");
  const [sParty, setSParty] = useState("Walk-in");
  const [sMethod, setSMethod] = useState("UPI");
  // Purchase state
  const [pProduct, setPProduct] = useState("");
  const [pQty, setPQty] = useState("10");
  const [pCost, setPCost] = useState("");
  const [pParty, setPParty] = useState("");
  const [pMethod, setPMethod] = useState("Bank Transfer");
  // Expense state
  const [eCategory, setECategory] = useState("");
  const [eAmount, setEAmount] = useState("");
  const [eParty, setEParty] = useState("");
  const [eMethod, setEMethod] = useState("UPI");
  const [eNote, setENote] = useState("");
  // Modals
  const [catModal, setCatModal] = useState<null | TransactionType>(null);
  const [newCat, setNewCat] = useState("");
  const [catErr, setCatErr] = useState("");
  const [prodModal, setProdModal] = useState<null | TransactionType>(null);
  const [newProd, setNewProd] = useState({ name: "", category: "", price: "", cost: "" });
  const [prodErr, setProdErr] = useState("");

  const saleCats = useMemo(() => categories.filter((c) => c.type === "sale"), [categories]);
  const purchaseCats = useMemo(() => categories.filter((c) => c.type === "purchase"), [categories]);
  const expenseCats = useMemo(() => categories.filter((c) => c.type === "expense"), [categories]);
  const saleProducts = useMemo(() => products.filter((p) => p.type === "sale"), [products]);
  const purchaseProducts = useMemo(() => products.filter((p) => p.type === "purchase"), [products]);

  const selSaleProd: MockProduct | undefined = saleProducts.find((p) => p.name === sProduct);
  const effPrice = sPrice !== "" ? toMinor(sPrice) : selSaleProd?.salePriceMinor ?? 0;
  const effCost = sCost !== "" ? toMinor(sCost) : selSaleProd?.costMinor ?? 0;
  const qty = Math.max(0, parseFloat(sQty) || 0);
  const saleTotal = Math.round(qty * effPrice);
  const saleCogs = Math.round(qty * effCost);
  const saleGross = saleTotal - saleCogs;
  const saleMargin = saleTotal > 0 ? (saleGross / saleTotal) * 100 : 0;

  const selPurchProd: MockProduct | undefined = purchaseProducts.find((p) => p.name === pProduct);
  const effPCost = pCost !== "" ? toMinor(pCost) : selPurchProd?.costMinor ?? 0;
  const pQtyNum = Math.max(0, parseFloat(pQty) || 0);
  const purchTotal = Math.round(pQtyNum * effPCost);
  const nowLocal = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  };

  // Voice draft → editable review fields. Never invents missing values.
  const applyVoiceDraft = (d: VoiceDraft) => {
    setVoiceDraft(d);
    setVoiceTranscript(d.transcript);
    setVoiceErr("");
    setSaved("");
    setVType(d.transaction_type);
    setTab(d.transaction_type);
    setVDate(/^\d{4}-\d{2}-\d{2}$/.test(d.date.trim()) ? d.date.trim() : "");
    setVDesc(d.description);
    setVCategory(d.category);
    setVCounterparty(d.counterparty);
    setVChannel(d.channel);
    setVMethod(d.payment_method);
    setVItem(d.item_name);
    setVQty(d.quantity);
    setVSell(d.unit_selling_price);
    setVBuy(d.unit_buying_cost);
    setVAmount(d.amount);
  };

  const buildSaleDraft = (): MockTransaction | null => {
    const name = (sProduct || selSaleProd?.name || "").trim();
    if (!name) return null;
    if (qty <= 0 || effPrice <= 0) return null;
    // Live with no categories yet: allow "General" draft; saver sends category_id NULL.
    const cat = selSaleProd?.category ?? saleCats[0]?.name ?? "General";
    return {
      id: uid("txn"),
      type: "sale",
      date: nowLocal(),
      category: cat,
      product: name,
      qty,
      unitPriceMinor: effPrice,
      buyingCostMinor: effCost,
      buyingCostTotalMinor: saleCogs,
      party: sParty.trim() || "Walk-in",
      amountMinor: saleTotal,
      currency: profile.currencyCode,
      paymentMethod: sMethod,
      reference: `SALE-${Date.now().toString().slice(-6)}`,
    };
  };

  const buildPurchaseDraft = (): MockTransaction | null => {
    const name = (pProduct || selPurchProd?.name || "").trim();
    if (!name) return null;
    if (pQtyNum <= 0 || effPCost <= 0) return null;
    const cat = selPurchProd?.category ?? purchaseCats[0]?.name ?? "Stock";
    return {
      id: uid("txn"),
      type: "purchase",
      date: nowLocal(),
      category: cat,
      product: name,
      qty: pQtyNum,
      unitPriceMinor: effPCost,
      party: pParty.trim() || "Supplier",
      amountMinor: purchTotal,
      currency: profile.currencyCode,
      paymentMethod: pMethod,
      reference: `PUR-${Date.now().toString().slice(-6)}`,
    };
  };

  const buildExpenseDraft = (): MockTransaction | null => {
    const amt = toMinor(eAmount);
    const cat = eCategory || expenseCats[0]?.name;
    if (!cat || amt <= 0) return null;
    return {
      id: uid("txn"),
      type: "expense",
      date: nowLocal(),
      category: cat,
      party: eParty.trim() || "Payee",
      amountMinor: amt,
      currency: profile.currencyCode,
      paymentMethod: eMethod,
      reference: `EXP-${Date.now().toString().slice(-6)}`,
      notes: eNote.trim() || undefined,
    };
  };

  const onReview = () => {
    setSaved("");
    const draft = tab === "sale" ? buildSaleDraft() : tab === "purchase" ? buildPurchaseDraft() : buildExpenseDraft();
    setReview(draft);
  };

  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");

  // Voice draft → canonical MockTransaction (same shape/validation as manual).
  const buildVoiceReview = (): MockTransaction | null => {
    if (!voiceDraft) return null;
    const t = vType;
    const date = vDate ? `${vDate}T${nowLocal().slice(11)}` : nowLocal();
    if (t === "sale") {
      const name = vItem.trim();
      const q = Math.max(0, parseFloat(vQty) || 0);
      const price = toMinor(vSell);
      if (!name || q <= 0 || price <= 0) return null;
      const cost = toMinor(vBuy);
      const cogs = Math.round(q * cost);
      return {
        id: uid("txn"),
        type: "sale",
        date,
        category: vCategory.trim() || "General",
        product: name,
        qty: q,
        unitPriceMinor: price,
        buyingCostMinor: cost,
        buyingCostTotalMinor: cogs,
        party: vCounterparty.trim() || "Walk-in",
        amountMinor: Math.round(q * price),
        currency: profile.currencyCode,
        paymentMethod: vMethod.trim() || "UPI",
        reference: `SALE-${Date.now().toString().slice(-6)}`,
        notes: vDesc.trim() || `Voice: ${voiceTranscript}`.slice(0, 200) || undefined,
      };
    }
    if (t === "purchase") {
      const name = vItem.trim();
      const q = Math.max(0, parseFloat(vQty) || 0);
      // Prefer explicit unit cost; fall back to amount/qty when only a total was heard.
      const fallbackUnit =
        vBuy.trim() === "" && vAmount.trim() !== "" && q > 0 && isFinite(parseFloat(vAmount))
          ? String(parseFloat(vAmount) / q)
          : "";
      const cost = toMinor(vBuy.trim() !== "" ? vBuy : fallbackUnit);
      if (!name || q <= 0 || cost <= 0) return null;
      return {
        id: uid("txn"),
        type: "purchase",
        date,
        category: vCategory.trim() || "Stock",
        product: name,
        qty: q,
        unitPriceMinor: cost,
        party: vCounterparty.trim() || "Vendor",
        amountMinor: Math.round(q * cost),
        currency: profile.currencyCode,
        paymentMethod: vMethod.trim() || "Bank Transfer",
        reference: `PUR-${Date.now().toString().slice(-6)}`,
        notes: vDesc.trim() || `Voice: ${voiceTranscript}`.slice(0, 200) || undefined,
      };
    }
    const amt = toMinor(vAmount);
    if (!vCategory.trim() || amt <= 0) return null;
    return {
      id: uid("txn"),
      type: "expense",
      date,
      category: vCategory.trim(),
      party: vCounterparty.trim() || "Payee",
      amountMinor: amt,
      currency: profile.currencyCode,
      paymentMethod: vMethod.trim() || "UPI",
      reference: `EXP-${Date.now().toString().slice(-6)}`,
      notes: vDesc.trim() || `Voice: ${voiceTranscript}`.slice(0, 200) || undefined,
    };
  };

  const onVoiceConfirm = async () => {
    if (voiceSaving) return; // prevent duplicate saves on double-click/retry
    const draft = buildVoiceReview();
    if (!draft) {
      setVoiceErr("Complete the required fields (item + qty + price for sale/purchase; category + amount for expense).");
      return;
    }
    if (!isLive) {
      addTransaction(draft);
      setSaved(`${draft.type} ${formatMoney(draft.amountMinor, draft.currency)} saved to ${profile.name} ledger (mock voice). See Ledger + Dashboard.`);
      setVoiceDraft(null);
      setVoiceTranscript("");
      return;
    }
    if (!activeBusinessId) {
      setVoiceErr("No active business selected.");
      return;
    }
    if (!canWriteLive) {
      setVoiceErr("Your role is view-only for this business.");
      return;
    }
    setVoiceSaving(true);
    setVoiceErr("");
    try {
      const catKey = `${draft.type}:${draft.category.toLowerCase()}`;
      const category_id = liveByType.get(catKey)?.id ?? null;
      await createLiveTransaction(activeBusinessId, {
        transaction_type: draft.type,
        transaction_date: new Date(draft.date.length === 16 ? `${draft.date}:00` : draft.date).toISOString(),
        description: draft.product ? `${draft.product} · ${draft.category}` : draft.category,
        category_id,
        counterparty_name: draft.party,
        payment_method: draft.paymentMethod,
        currency_code: draft.currency,
        total_minor: draft.amountMinor,
        buying_cost_total_minor: draft.type === "sale" ? draft.buyingCostTotalMinor ?? null : null,
        item_name: draft.product ?? null,
        quantity: draft.qty ?? null,
        unit_selling_price_minor: draft.unitPriceMinor ?? null,
        unit_buying_cost_minor: draft.buyingCostMinor ?? null,
      });
      await refresh();
      setSaved(`${draft.type} ${formatMoney(draft.amountMinor, draft.currency)} saved to ${profile.name} (live voice). See Ledger + Dashboard.`);
      setVoiceDraft(null);
      setVoiceTranscript("");
    } catch (e) {
      setVoiceErr(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setVoiceSaving(false);
    }
  };

  const onConfirm = async () => {
    if (!review) return;
    if (!isLive) {
      addTransaction(review);
      setSaved(`${review.type} ${formatMoney(review.amountMinor, review.currency)} saved to ${profile.name} ledger (mock). See Ledger + Dashboard.`);
      setReview(null);
      return;
    }
    if (!activeBusinessId) {
      setFormError("No active business selected.");
      return;
    }
    if (!canWriteLive) {
      setFormError("Your role is view-only for this business.");
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const catKey = `${review.type}:${review.category.toLowerCase()}`;
      const category_id = liveByType.get(catKey)?.id ?? null;
      await createLiveTransaction(activeBusinessId, {
        transaction_type: review.type,
        transaction_date: new Date(review.date.length === 16 ? `${review.date}:00` : review.date).toISOString(),
        description: review.product ? `${review.product} · ${review.category}` : review.category,
        category_id,
        counterparty_name: review.party,
        payment_method: review.paymentMethod,
        currency_code: review.currency,
        total_minor: review.amountMinor,
        buying_cost_total_minor: review.type === "sale" ? review.buyingCostTotalMinor ?? null : null,
        // Draft line-item persists via transaction_items.item_name (product_id NULL, no catalogue table).
        item_name: review.product ?? null,
        quantity: review.qty ?? null,
        unit_selling_price_minor: review.unitPriceMinor ?? null,
        unit_buying_cost_minor: review.buyingCostMinor ?? null,
      });
      await refresh();
      setSaved(`${review.type} ${formatMoney(review.amountMinor, review.currency)} saved to ${profile.name} (live). See Ledger + Dashboard.`);
      setReview(null);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't save. Try again.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto max-w-2xl space-y-5 animate-fade-in">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-brand-950 to-slate-900 border border-slate-800/80 p-6 sm:p-7 text-white shadow-xl">
        <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="pointer-events-none absolute right-20 bottom-0 h-32 w-32 rounded-full bg-indigo-500/15 blur-2xl" />

        <div className="relative z-10">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-md">
              <span className={cx("h-1.5 w-1.5 rounded-full", isLive ? "bg-emerald-400" : "bg-brand-400")} />
              {isLive ? "Live Workspace" : "Demo Dataset"} · Verified Entry
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl text-white">
            Log Entry
          </h1>
          <p className="mt-1 text-sm text-slate-300 max-w-lg leading-relaxed">
            Quick manual or voice capture for <span className="font-semibold text-white">{profile.name}</span> {isLive ? "(live ledger)" : "(demo store)"}.
          </p>

          {isLive && !canWriteLive && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 text-xs font-medium text-amber-200">
              <span>⚠️</span>
              <span>View-only role — new entries are disabled for viewers.</span>
            </div>
          )}
          {isLive && categories.length === 0 && (
            <p className="mt-3 text-xs font-medium text-amber-200/90">
              No live categories configured yet — add a category below to enable saving.
            </p>
          )}
        </div>
      </div>

      {/* Voice entry — visible microphone option */}
      <div className="card space-y-4 border-slate-200/80 dark:border-slate-800/80 shadow-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-base text-white shadow-md shadow-brand-500/20">
              🎙️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Voice Entry</h2>
                <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300 border border-brand-200/60 dark:border-brand-800">
                  AI Transcribe
                </span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Speak a sale, purchase, or expense — review and confirm before saving.
              </p>
            </div>
          </div>
          <div className="sm:self-center">
            <VoiceEntryButton
              disabled={isLive && !canWriteLive}
              onTranscript={(t) => {
                setVoiceTranscript(t);
                setVoiceErr("");
              }}
              onDraft={applyVoiceDraft}
              onError={(m) => setVoiceErr(m)}
            />
          </div>
        </div>

        {voiceErr && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/90 p-3 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
            {voiceErr}
          </div>
        )}

        {voiceTranscript && !voiceDraft && !voiceErr && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs dark:border-slate-800 dark:bg-slate-900/70">
            <div className="font-semibold text-slate-700 dark:text-slate-300">Heard:</div>
            <p className="mt-1 text-slate-600 dark:text-slate-300 italic">&ldquo;{voiceTranscript}&rdquo;</p>
          </div>
        )}

        {voiceDraft && (
          <VoiceDraftReview
            draft={voiceDraft}
            transcript={voiceTranscript}
            categories={categories}
            vType={vType}
            setVType={setVType}
            vDate={vDate}
            setVDate={setVDate}
            vDesc={vDesc}
            setVDesc={setVDesc}
            vCategory={vCategory}
            setVCategory={setVCategory}
            vCounterparty={vCounterparty}
            setVCounterparty={setVCounterparty}
            vChannel={vChannel}
            setVChannel={setVChannel}
            vMethod={vMethod}
            setVMethod={setVMethod}
            vItem={vItem}
            setVItem={setVItem}
            vQty={vQty}
            setVQty={setVQty}
            vSell={vSell}
            setVSell={setVSell}
            vBuy={vBuy}
            setVBuy={setVBuy}
            vAmount={vAmount}
            setVAmount={setVAmount}
            voiceSaving={voiceSaving}
            onConfirm={() => void onVoiceConfirm()}
            onDiscard={() => {
              setVoiceDraft(null);
              setVoiceTranscript("");
              setVoiceErr("");
            }}
          />
        )}
      </div>

      {/* Manual Entry Segmented Tabs */}
      <div className="grid grid-cols-3 gap-2.5" role="tablist" aria-label="Entry type">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              onClick={() => { setTab(t.key); setSaved(""); setReview(null); }}
              className={cx(
                "group relative rounded-2xl border p-3.5 text-left transition-all",
                active
                  ? "border-brand-500 bg-gradient-to-b from-brand-50/80 to-white shadow-sm ring-2 ring-brand-500/20 dark:border-brand-500 dark:from-brand-950/40 dark:to-slate-900"
                  : "border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cx(
                  "font-bold text-sm tracking-tight",
                  active ? "text-brand-600 dark:text-brand-400" : "text-slate-800 dark:text-slate-200"
                )}>
                  {t.label}
                </span>
                <span className={cx(
                  "h-2 w-2 rounded-full",
                  t.key === "sale" ? "bg-emerald-500" : t.key === "purchase" ? "bg-blue-500" : "bg-purple-500"
                )} />
              </div>
              <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{t.hint}</div>
            </button>
          );
        })}
      </div>

      {/* Sale Form */}
      {tab === "sale" && (
        <div className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80">
          <div>
            <label className="label" htmlFor="sp">Product or Line-Item</label>
            {isLive && saleProducts.length === 0 ? (
              <div className="space-y-2">
                <input id="sp" className="input" placeholder="e.g. Basmati Rice 5kg" value={sProduct} onChange={(e) => setSProduct(e.target.value)} />
                <p className="text-xs text-slate-500 dark:text-slate-400">No saved items yet — type the item name for this sale. It will persist as the transaction line-item.</p>
              </div>
            ) : (
            <div className="flex gap-2">
              <select id="sp" className="input flex-1" value={sProduct} onChange={(e) => setSProduct(e.target.value)}>
                <option value="">Select product…</option>
                {saleProducts.map((p) => <option key={p.name} value={p.name}>{p.name} · {formatMoney(p.salePriceMinor, profile.currencyCode)}</option>)}
              </select>
              <button type="button" className="btn-secondary shrink-0 px-3.5" onClick={() => { setProdModal("sale"); setProdErr(""); setNewProd({ name: "", category: saleCats[0]?.name ?? "", price: "", cost: "" }); }}>+ Product</button>
            </div>
            )}
            {isLive && saleProducts.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Suggestions from saved sale line-items (this business only) — no product catalogue table exists.</p>
            )}
            {isLive && saleProducts.length > 0 && (
              <div className="mt-2.5 flex gap-2">
                <input className="input" placeholder="Or type a new item name…" value={sProduct} onChange={(e) => setSProduct(e.target.value)} aria-label="New sale item name" />
                <button type="button" className="btn-secondary shrink-0 px-3.5" onClick={() => { setProdModal("sale"); setProdErr(""); setNewProd({ name: sProduct, category: saleCats[0]?.name ?? "", price: "", cost: "" }); }}>+ Item</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
            <div>
              <label className="label" htmlFor="sq">Qty</label>
              <input id="sq" inputMode="decimal" className="input" value={sQty} onChange={(e) => setSQty(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="spr">Sell ₹/unit</label>
              <input id="spr" inputMode="decimal" className="input" placeholder={selSaleProd ? String((selSaleProd.salePriceMinor / 100).toFixed(2)) : "0.00"} value={sPrice} onChange={(e) => setSPrice(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sco">Cost ₹/unit</label>
              <input id="sco" inputMode="decimal" className="input" placeholder={selSaleProd ? String((selSaleProd.costMinor / 100).toFixed(2)) : "0.00"} value={sCost} onChange={(e) => setSCost(e.target.value)} />
            </div>
          </div>

          {/* Live Profit Preview Box */}
          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Revenue Total</span>
              <span className="num font-black text-lg text-slate-900 dark:text-white">{formatMoney(saleTotal, profile.currencyCode)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 pt-2 dark:border-slate-800">
              <span>COGS (qty × cost)</span>
              <span className="num font-semibold text-slate-600 dark:text-slate-300">{formatMoney(saleCogs, profile.currencyCode)}</span>
            </div>
            <div className="flex items-center justify-between text-xs border-t border-slate-200/60 pt-2 dark:border-slate-800">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Gross profit · margin</span>
              <span className={cx("num font-bold text-sm", saleGross >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                {formatMoney(saleGross, profile.currencyCode)} · {saleMargin.toFixed(1)}%
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="spa">Customer</label>
              <input id="spa" className="input" value={sParty} onChange={(e) => setSParty(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="sme">Payment Method</label>
              <select id="sme" className="input" value={sMethod} onChange={(e) => setSMethod(e.target.value)}>
                {["UPI", "Cash", "Card", "Bank Transfer"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <button className="btn-primary w-full py-3.5 text-base font-bold shadow-md" onClick={onReview}>
            Review Sale Entry →
          </button>
        </div>
      )}

      {/* Purchase Form */}
      {tab === "purchase" && (
        <div className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80">
          <div>
            <label className="label" htmlFor="pp">Item / Product</label>
            {isLive && purchaseProducts.length === 0 ? (
              <div className="space-y-2">
                <input id="pp" className="input" placeholder="e.g. Stock — Rice bags" value={pProduct} onChange={(e) => setPProduct(e.target.value)} />
                <p className="text-xs text-slate-500 dark:text-slate-400">No saved items yet — type the item name for this purchase. It will persist as the transaction line-item.</p>
              </div>
            ) : (
            <div className="flex gap-2">
              <select id="pp" className="input flex-1" value={pProduct} onChange={(e) => setPProduct(e.target.value)}>
                <option value="">Select item…</option>
                {purchaseProducts.map((p) => <option key={p.name} value={p.name}>{p.name} · {formatMoney(p.costMinor, profile.currencyCode)}</option>)}
              </select>
              <button type="button" className="btn-secondary shrink-0 px-3.5" onClick={() => { setProdModal("purchase"); setProdErr(""); setNewProd({ name: "", category: purchaseCats[0]?.name ?? "", price: "", cost: "" }); }}>+ Item</button>
            </div>
            )}
            {isLive && purchaseProducts.length > 0 && (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Suggestions from saved purchase line-items (this business only) — no product catalogue table exists.</p>
            )}
            {isLive && purchaseProducts.length > 0 && (
              <div className="mt-2.5 flex gap-2">
                <input className="input" placeholder="Or type a new item name…" value={pProduct} onChange={(e) => setPProduct(e.target.value)} aria-label="New purchase item name" />
                <button type="button" className="btn-secondary shrink-0 px-3.5" onClick={() => { setProdModal("purchase"); setProdErr(""); setNewProd({ name: pProduct, category: purchaseCats[0]?.name ?? "", price: "", cost: "" }); }}>+ Item</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="pq">Qty</label>
              <input id="pq" inputMode="decimal" className="input" value={pQty} onChange={(e) => setPQty(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pc">Buy ₹/unit</label>
              <input id="pc" inputMode="decimal" className="input" placeholder={selPurchProd ? String((selPurchProd.costMinor / 100).toFixed(2)) : "0.00"} value={pCost} onChange={(e) => setPCost(e.target.value)} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 dark:border-slate-800 dark:bg-slate-900/60">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-slate-700 dark:text-slate-300">Purchase Total (qty × unit)</span>
              <span className="num font-black text-lg text-slate-900 dark:text-white">{formatMoney(purchTotal, profile.currencyCode)}</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ppa">Supplier</label>
              <input id="ppa" className="input" placeholder="Distributor…" value={pParty} onChange={(e) => setPParty(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="pme">Payment Method</label>
              <select id="pme" className="input" value={pMethod} onChange={(e) => setPMethod(e.target.value)}>
                {["Bank Transfer", "UPI", "Cash", "Card"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <button className="btn-primary w-full py-3.5 text-base font-bold shadow-md" onClick={onReview}>
            Review Purchase Entry →
          </button>
        </div>
      )}

      {/* Expense Form */}
      {tab === "expense" && (
        <div className="card space-y-4 border-slate-200/80 shadow-card dark:border-slate-800/80">
          <div>
            <label className="label" htmlFor="ec">Expense Category</label>
            <div className="flex gap-2">
              <select id="ec" className="input flex-1" value={eCategory} onChange={(e) => setECategory(e.target.value)}>
                <option value="">Select category…</option>
                {expenseCats.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <button type="button" className="btn-secondary shrink-0 px-3.5" onClick={() => { setCatModal("expense"); setCatErr(""); setNewCat(""); }}>+ Category</button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="ea">Amount (₹)</label>
              <input id="ea" inputMode="decimal" className="input font-semibold" placeholder="0.00" value={eAmount} onChange={(e) => setEAmount(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="ep">Payee</label>
              <input id="ep" className="input" placeholder="Landlord / utility…" value={eParty} onChange={(e) => setEParty(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="em">Payment Method</label>
              <select id="em" className="input" value={eMethod} onChange={(e) => setEMethod(e.target.value)}>
                {["UPI", "Cash", "Card", "Bank Transfer"].map((m) => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="en">Note (optional)</label>
              <input id="en" className="input" value={eNote} onChange={(e) => setENote(e.target.value)} />
            </div>
          </div>

          <button className="btn-primary w-full py-3.5 text-base font-bold shadow-md" onClick={onReview}>
            Review Expense Entry →
          </button>
        </div>
      )}

      {!review && !saved && (
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          Fill the form, then review before saving. Nothing is saved until you confirm.
        </p>
      )}

      {/* Save Success Banner */}
      {!review && saved && (
        <div className="rounded-2xl border border-emerald-300 bg-emerald-50/90 p-5 shadow-sm dark:border-emerald-800 dark:bg-emerald-950/40">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">✓</span>
            <p className="font-semibold text-emerald-800 dark:text-emerald-200">{saved}</p>
          </div>
          <div className="mt-4 flex gap-3">
            <button className="btn-secondary flex-1 py-2.5 font-semibold" onClick={() => router.push("/ledger")}>View Ledger →</button>
            <button className="btn-secondary flex-1 py-2.5 font-semibold" onClick={() => router.push("/dashboard")}>View Dashboard →</button>
          </div>
        </div>
      )}

      {/* Review Modal / Bottom Card */}
      {review && (
        <div className="card space-y-4 border-emerald-200 shadow-xl dark:border-emerald-900/50">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-sm font-bold text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">✓</span>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Review {review.type} before saving</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Verify transaction details before committing to ledger</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/60">
            <dt className="text-slate-500 dark:text-slate-400">Item</dt>
            <dd className="text-right font-semibold text-slate-900 dark:text-white">{review.product ?? review.category}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Category</dt>
            <dd className="text-right text-slate-700 dark:text-slate-300">{review.category}</dd>
            {review.qty != null && (
              <>
                <dt className="text-slate-500 dark:text-slate-400">Qty</dt>
                <dd className="num text-right font-medium text-slate-900 dark:text-white">{review.qty}</dd>
              </>
            )}
            <dt className="text-slate-500 dark:text-slate-400">Total</dt>
            <dd className="num text-right text-base font-black text-slate-900 dark:text-white">{formatMoney(review.amountMinor, review.currency)}</dd>
            {review.type === "sale" && (
              <>
                <dt className="text-slate-500 dark:text-slate-400">COGS</dt>
                <dd className="num text-right text-slate-700 dark:text-slate-300">{formatMoney(review.buyingCostTotalMinor ?? 0, review.currency)}</dd>
              </>
            )}
            <dt className="text-slate-500 dark:text-slate-400">Party</dt>
            <dd className="text-right text-slate-700 dark:text-slate-300">{review.party}</dd>
            <dt className="text-slate-500 dark:text-slate-400">Payment</dt>
            <dd className="text-right text-slate-700 dark:text-slate-300">{review.paymentMethod}</dd>
          </dl>

          <div className="flex gap-3 pt-1">
            <button className="btn-secondary flex-1 py-3 font-semibold" onClick={() => setReview(null)}>← Edit</button>
            <button className="btn-primary flex-1 py-3 font-bold shadow-md" onClick={() => void onConfirm()} disabled={busy || (isLive && !canWriteLive)}>
              {busy ? "Saving…" : "Confirm & Save Entry"}
            </button>
          </div>
          {formError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300" role="alert">
              {formError}
            </p>
          )}
        </div>
      )}

      {/* Add Category Modal */}
      {catModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add category">
          <div className="card w-full max-w-sm space-y-4 shadow-2xl border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Add {catModal} category</h3>
              <button type="button" onClick={() => setCatModal(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            <input className="input" placeholder="e.g. Delivery Charges" value={newCat} onChange={(e) => setNewCat(e.target.value)} autoFocus />
            {catErr && <p className="text-xs font-medium text-rose-500">{catErr}</p>}
            <div className="flex gap-2.5 pt-1">
              <button className="btn-secondary flex-1 py-2.5" onClick={() => setCatModal(null)}>Cancel</button>
              <button
                className="btn-primary flex-1 py-2.5 font-semibold"
                onClick={() => {
                  void (async () => {
                    if (isLive) {
                      const clean = newCat.trim();
                      if (!clean || !activeBusinessId || !canWriteLive) {
                        setCatErr(!canWriteLive ? "View-only role." : "Name is empty or already exists for this type.");
                        return;
                      }
                      try {
                        const created = await createLiveCategory(activeBusinessId, catModal, clean);
                        if (catModal === "expense") setECategory(created.name);
                        await refresh();
                        setCatModal(null);
                      } catch {
                        setCatErr("Name is empty or already exists for this type.");
                      }
                      return;
                    }
                    const ok = addCategory(newCat, catModal);
                    if (!ok) {
                      setCatErr("Name is empty or already exists for this type.");
                      return;
                    }
                    if (catModal === "expense") setECategory(newCat.trim());
                    setCatModal(null);
                  })();
                }}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {prodModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Add product">
          <div className="card w-full max-w-sm space-y-4 shadow-2xl border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-slate-900 dark:text-white">Add {prodModal === "sale" ? "Sale Product" : "Purchase Item"}</h3>
              <button type="button" onClick={() => setProdModal(null)} className="text-slate-400 hover:text-slate-600 text-sm">✕</button>
            </div>
            {isLive && (
              <p className="rounded-xl bg-slate-50 p-2.5 text-xs text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                Live: no product catalogue table exists — this adds the item to the current draft only.
                The name persists via transaction items when confirmed.
              </p>
            )}
            <div>
              <label className="label">Item Name</label>
              <input className="input" value={newProd.name} onChange={(e) => setNewProd((p) => ({ ...p, name: e.target.value }))} autoFocus />
            </div>
            <div>
              <label className="label">Category</label>
              <select className="input" value={newProd.category} onChange={(e) => setNewProd((p) => ({ ...p, category: e.target.value }))}>
                {(prodModal === "sale" ? saleCats : purchaseCats).map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="label">Sell ₹/unit</label>
                <input className="input" inputMode="decimal" value={newProd.price} onChange={(e) => setNewProd((p) => ({ ...p, price: e.target.value }))} />
              </div>
              <div>
                <label className="label">Cost ₹/unit</label>
                <input className="input" inputMode="decimal" value={newProd.cost} onChange={(e) => setNewProd((p) => ({ ...p, cost: e.target.value }))} />
              </div>
            </div>
            {prodErr && <p className="text-xs font-medium text-rose-500">{prodErr}</p>}
            <div className="flex gap-2.5 pt-1">
              <button className="btn-secondary flex-1 py-2.5" onClick={() => setProdModal(null)}>Cancel</button>
              <button
                className="btn-primary flex-1 py-2.5 font-semibold"
                onClick={() => {
                  const clean = newProd.name.trim();
                  const salePriceMinor = toMinor(newProd.price) || toMinor(newProd.cost);
                  const costMinor = toMinor(newProd.cost);
                  if (!clean || salePriceMinor <= 0) {
                    setProdErr("Enter a name and a valid price.");
                    return;
                  }
                  // Live: draft-only (no catalogue persistence possible). Demo/mock: mock catalogue.
                  if (isLive) {
                    if (prodModal === "sale") {
                      setSProduct(clean);
                      if (!sPrice && salePriceMinor > 0) setSPrice((salePriceMinor / 100).toFixed(2));
                      if (!sCost && costMinor > 0) setSCost((costMinor / 100).toFixed(2));
                    } else {
                      setPProduct(clean);
                      if (!pCost) setPCost(((costMinor || salePriceMinor) / 100).toFixed(2));
                    }
                    setSaved("");
                    setProdModal(null);
                    return;
                  }
                  const ok = addProduct({
                    name: clean,
                    category: newProd.category || (prodModal === "sale" ? saleCats[0]?.name ?? "General" : purchaseCats[0]?.name ?? "Stock"),
                    salePriceMinor: prodModal === "sale" ? salePriceMinor : 0,
                    costMinor,
                    type: prodModal,
                  });
                  if (!ok) {
                    setProdErr("A product with this name already exists.");
                    return;
                  }
                  if (prodModal === "sale") setSProduct(clean);
                  else setPProduct(clean);
                  setProdModal(null);
                }}
              >
                Add Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

