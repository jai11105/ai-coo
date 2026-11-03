// Shared voice-entry contracts (Log Entry voice flow).
// UI → Mic → POST /api/entry/transcribe (Meta Voice Transcribe) → transcript →
// POST /api/entry/extract (Muse Spark Contributor) → VoiceDraft →
// review/edit → Confirm & Save.

import type { TransactionType } from "./types";

export type VoiceStatus =
  | "idle"
  | "requesting"
  | "recording"
  | "stopped"
  | "transcribing"
  | "extracting"
  | "ready"
  | "error";

export interface VoiceDraft {
  transaction_type: TransactionType;
  /** YYYY-MM-DD or "" when unknown — never invented. */
  date: string;
  description: string;
  /** Category name suggestion (may be "" when unknown). */
  category: string;
  counterparty: string;
  channel: string;
  payment_method: string;
  item_name: string;
  /** Quantity as string (preserves decimals); "" when unknown. */
  quantity: string;
  /** Rupees as strings; "" when unknown. */
  unit_selling_price: string;
  unit_buying_cost: string;
  /** Total amount rupees as string; "" when unknown. */
  amount: string;
  /** Confidence 0..1 when provided by the extractor. */
  confidence: number | null;
  /** Fields the model was unsure about — user must verify. */
  uncertain_fields: string[];
  /** Clarifying questions when the transcript is incomplete/ambiguous. */
  needs_clarification: string[];
  /** Raw transcript that produced this draft. */
  transcript: string;
}

export const EMPTY_VOICE_DRAFT: VoiceDraft = {
  transaction_type: "sale",
  date: "",
  description: "",
  category: "",
  counterparty: "",
  channel: "",
  payment_method: "",
  item_name: "",
  quantity: "",
  unit_selling_price: "",
  unit_buying_cost: "",
  amount: "",
  confidence: null,
  uncertain_fields: [],
  needs_clarification: [],
  transcript: "",
};

export function isVoiceDraft(v: unknown): v is VoiceDraft {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return (
    (d.transaction_type === "sale" ||
      d.transaction_type === "purchase" ||
      d.transaction_type === "expense") &&
    typeof d.date === "string"
  );
}
