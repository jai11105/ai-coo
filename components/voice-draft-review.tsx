"use client";

// Editable review card for a voice-extracted draft.
// Every field is editable; nothing saves until Confirm & Save.

import { cx } from "@/lib/utils";
import type { MockCategory } from "@/lib/types";
import type { TransactionType } from "@/lib/types";
import type { VoiceDraft } from "@/lib/voice-entry";

interface Props {
  draft: VoiceDraft;
  transcript: string;
  categories: MockCategory[];
  vType: TransactionType;
  setVType: (t: TransactionType) => void;
  vDate: string;
  setVDate: (v: string) => void;
  vDesc: string;
  setVDesc: (v: string) => void;
  vCategory: string;
  setVCategory: (v: string) => void;
  vCounterparty: string;
  setVCounterparty: (v: string) => void;
  vChannel: string;
  setVChannel: (v: string) => void;
  vMethod: string;
  setVMethod: (v: string) => void;
  vItem: string;
  setVItem: (v: string) => void;
  vQty: string;
  setVQty: (v: string) => void;
  vSell: string;
  setVSell: (v: string) => void;
  vBuy: string;
  setVBuy: (v: string) => void;
  vAmount: string;
  setVAmount: (v: string) => void;
  voiceSaving: boolean;
  onConfirm: () => void;
  onDiscard: () => void;
}

export function VoiceDraftReview(p: Props) {
  const cats = p.categories.filter((c) => c.type === p.vType);
  return (
    <div className="space-y-4 rounded-2xl border border-brand-200/80 bg-gradient-to-b from-brand-50/70 to-white p-4 sm:p-5 shadow-card dark:border-brand-900/50 dark:from-slate-900 dark:to-slate-900/90">
      <div className="flex items-center justify-between gap-2 border-b border-brand-100 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white shadow-sm shadow-brand-500/25">
            <svg className="h-3.5 w-3.5 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
            Voice draft · Unsaved
          </span>
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">Review and edit before saving</span>
        </div>
        <button
          type="button"
          className="text-xs font-semibold text-rose-600 hover:text-rose-700 dark:text-rose-400 dark:hover:text-rose-300 transition-colors"
          onClick={p.onDiscard}
        >
          Discard Draft
        </button>
      </div>

      {p.transcript && (
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3.5 text-xs shadow-sm dark:border-slate-800 dark:bg-slate-950/60">
          <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
            <span className="text-brand-600 dark:text-brand-400">🎙️</span> Original Transcript:
          </div>
          <p className="mt-1 text-slate-600 dark:text-slate-300 italic leading-relaxed">
            &ldquo;{p.transcript}&rdquo;
          </p>
        </div>
      )}

      <div>
        <label className="label">Entry Type</label>
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Voice entry type">
          {(["sale", "purchase", "expense"] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={p.vType === t}
              onClick={() => p.setVType(t)}
              className={cx(
                "group relative rounded-xl border p-2.5 text-left transition-all",
                p.vType === t
                  ? "border-brand-500 bg-white shadow-sm ring-2 ring-brand-500/20 dark:border-brand-500 dark:bg-slate-800"
                  : "border-slate-200 bg-white/50 hover:border-slate-300 hover:bg-white dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-slate-700"
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cx(
                  "font-bold text-sm capitalize",
                  p.vType === t ? "text-brand-600 dark:text-brand-400" : "text-slate-700 dark:text-slate-300"
                )}>
                  {t}
                </span>
                {p.draft.transaction_type === t && (
                  <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700 dark:bg-brand-950 dark:text-brand-300">
                    Detected
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="vd">Date</label>
          <input id="vd" type="date" className="input" value={p.vDate} onChange={(e) => p.setVDate(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="vc">Category</label>
          <input id="vc" className="input" list="voice-cat-list" value={p.vCategory} onChange={(e) => p.setVCategory(e.target.value)} />
          <datalist id="voice-cat-list">
            {cats.map((c) => (
              <option key={`${c.type}-${c.name}`} value={c.name} />
            ))}
          </datalist>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="vdesc">Description</label>
        <input id="vdesc" className="input" value={p.vDesc} onChange={(e) => p.setVDesc(e.target.value)} />
      </div>

      {p.vType !== "expense" && (
        <div className="space-y-3 rounded-xl border border-slate-200/70 bg-white/70 p-3.5 dark:border-slate-800 dark:bg-slate-900/50">
          <div>
            <label className="label" htmlFor="vi">Item name</label>
            <input id="vi" className="input" value={p.vItem} onChange={(e) => p.setVItem(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label" htmlFor="vq">Qty</label>
              <input id="vq" inputMode="decimal" className="input" value={p.vQty} onChange={(e) => p.setVQty(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="vs">{p.vType === "sale" ? "Sell/unit" : "Buy/unit"}</label>
              <input id="vs" inputMode="decimal" className="input" value={p.vType === "sale" ? p.vSell : p.vBuy} onChange={(e) => (p.vType === "sale" ? p.setVSell(e.target.value) : p.setVBuy(e.target.value))} />
            </div>
            <div>
              <label className="label" htmlFor="vb">Cost/unit</label>
              <input id="vb" inputMode="decimal" className="input" value={p.vBuy} onChange={(e) => p.setVBuy(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {p.vType === "expense" && (
        <div>
          <label className="label" htmlFor="va">Amount</label>
          <input id="va" inputMode="decimal" className="input font-semibold" value={p.vAmount} onChange={(e) => p.setVAmount(e.target.value)} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="vparty">Counterparty</label>
          <input id="vparty" className="input" value={p.vCounterparty} onChange={(e) => p.setVCounterparty(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="vm">Payment</label>
          <select id="vm" className="input" value={p.vMethod} onChange={(e) => p.setVMethod(e.target.value)}>
            <option value="">Select…</option>
            {["UPI", "Cash", "Card", "Bank Transfer"].map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="vch">Channel</label>
          <input id="vch" className="input" value={p.vChannel} onChange={(e) => p.setVChannel(e.target.value)} placeholder="Optional" />
        </div>
      </div>

      {(p.draft.uncertain_fields.length > 0 || p.draft.needs_clarification.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3.5 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
          {p.draft.uncertain_fields.length > 0 && (
            <p className="flex items-center gap-1.5 font-medium">
              <span className="text-amber-600 font-bold">⚠️ Please verify:</span> {p.draft.uncertain_fields.join(", ")}
            </p>
          )}
          {p.draft.needs_clarification.map((q, i) => (
            <p key={i} className="mt-1.5 font-medium text-amber-800 dark:text-amber-300">❓ {q}</p>
          ))}
        </div>
      )}

      <div className="pt-2">
        <button type="button" className="btn-primary w-full py-3 text-base font-semibold shadow-md" disabled={p.voiceSaving} onClick={p.onConfirm}>
          {p.voiceSaving ? "Saving Entry…" : "Confirm & Save Entry"}
        </button>
        <p className="mt-2 text-center text-xs text-slate-500 dark:text-slate-400">
          Every field is editable above. Nothing is saved to your ledger until you click Confirm.
        </p>
      </div>
    </div>
  );
}
