// Live business data access (Phase 3). Browser-safe: uses the shared
// publishable-key client and the signed-in user's JWT, so RLS applies.
// NEVER import a service-role key here.

import { supabase } from "./client";

export interface LiveBusiness {
  id: string;
  name: string;
  business_type: string | null;
  industry: string | null;
  country_code: string;
  currency_code: string;
  timezone: string;
}

export interface Membership {
  business_id: string;
  role: string;
  status: string;
  business: LiveBusiness | null;
}

const BUSINESS_FIELDS =
  "id, name, business_type, industry, country_code, currency_code, timezone";

/** Businesses the user can access, via business_members (RLS-enforced). */
export async function fetchMyMemberships(userId: string): Promise<Membership[]> {
  const { data, error } = await supabase
    .from("business_members")
    .select(`business_id, role, status, businesses(${BUSINESS_FIELDS})`)
    .eq("user_id", userId)
    .eq("status", "active");

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[fetchMyMemberships] Supabase error:", error);
    throw new Error(formatDbError(error));
  }

  type Row = {
    business_id: string;
    role: string;
    status: string;
    businesses: LiveBusiness | LiveBusiness[] | null;
  };
  const rows = (data ?? []) as Row[];
  return rows.map((r) => ({
    business_id: r.business_id,
    role: r.role,
    status: r.status,
    business: Array.isArray(r.businesses) ? r.businesses[0] ?? null : r.businesses,
  }));
}

export interface CreateBusinessInput {
  name: string;
  business_type: string | null;
  industry: string | null;
  country_code: string;
  currency_code: string;
  timezone: string;
  locale: string;
}

export function formatDbError(error: {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}): string {
  const parts = [
    error.code ? `code=${error.code}` : "",
    `message=${error.message}`,
    error.details ? `details=${error.details}` : "",
    error.hint ? `hint=${error.hint}` : "",
  ].filter(Boolean);
  return parts.join(" | ");
}

/**
 * Create a business as the signed-in user.
 *
 * Actual public.businesses columns only:
 *   id, name, industry, business_type, country_code, currency_code,
 *   timezone, locale, is_demo, demo_dataset_key (+ legal_name/logo_url/
 *   region_code/financial_year_start_month left NULL, timestamps default).
 * No created_by / tax_jurisdiction / is_gst_registered / demo_owner —
 * those columns do not exist. Non-demo payload satisfies the INSERT policy
 * (is_demo=false, demo_dataset_key NULL). Owner membership is created by
 * the on_business_created_add_owner trigger from auth.uid(), never here.
 * Insert uses returning=minimal (no .select()) so no businesses SELECT
 * policy is needed for the new row.
 */
export async function createBusiness(
  userId: string,
  input: CreateBusinessInput
): Promise<LiveBusiness> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError) {
    // eslint-disable-next-line no-console
    console.error("[createBusiness] getUser failed:", userError);
    throw new Error(`Auth lookup failed | message=${userError.message}`);
  }
  const authId = user?.id ?? null;
  if (!authId) {
    throw new Error(
      "Auth session missing (401) | message=No signed-in user found. Please log out and log in again, then retry."
    );
  }
  if (authId !== userId) {
    throw new Error(
      `Stale session (403) | message=Signed-in user changed. expected=${userId} actual=${authId}`
    );
  }

  const newId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : "00000000-0000-4000-8000-" +
        Array.from({ length: 12 }, () =>
          Math.floor(Math.random() * 16).toString(16)
        ).join("");

  const payload = {
    id: newId,
    name: input.name,
    business_type: input.business_type,
    industry: input.industry,
    country_code: input.country_code,
    currency_code: input.currency_code,
    timezone: input.timezone,
    locale: input.locale,
    is_demo: false,
    demo_dataset_key: null,
  };

  // eslint-disable-next-line no-console
  console.info("[createBusiness] insert keys:", Object.keys(payload).join(","));

  const { error } = await supabase.from("businesses").insert(payload);

  if (error) {
    // eslint-disable-next-line no-console
    console.error("[createBusiness] insert error:", error);
    throw new Error(formatDbError(error));
  }

  return {
    id: newId,
    name: input.name,
    business_type: input.business_type,
    industry: input.industry,
    country_code: input.country_code,
    currency_code: input.currency_code,
    timezone: input.timezone,
  };
}

/** Map raw DB/RLS errors to clear, user-friendly messages. */
export function friendlyDbError(raw: string): string {
  const m = (raw || "").toLowerCase();
  if (
    m.includes("auth session missing") ||
    m.includes("stale session") ||
    m.includes("auth lookup failed")
  ) {
    return "Your sign-in expired. Please log out and log in again, then retry.";
  }
  if (m.includes("row-level security") || m.includes("permission denied") || m.includes("not authorized")) {
    return "Couldn't save this with your current sign-in (permission denied). Please log out and log in again, then retry.";
  }
  if (m.includes("schema cache") || m.includes("could not find")) {
    return "App and database are out of sync (unknown field). Please report this exact message to support.";
  }
  if (m.includes("network") || m.includes("fetch") || m.includes("failed to fetch")) {
    return "Network error. Check your connection and try again.";
  }
  if (m.includes("duplicate") || m.includes("already exists") || m.includes("23505")) {
    return "A business with these details already exists.";
  }
  if (m.includes("violates foreign key") || m.includes("23503")) {
    return "Your profile is missing, so the business can't be linked. Log out/in once, then retry.";
  }
  if (m.includes("violates not-null") || m.includes("23502")) {
    return "A required field was missing. Check the highlighted fields and try again.";
  }
  if (m.includes("violates") && m.includes("constraint")) {
    return "Some details were rejected. Check the highlighted fields and try again.";
  }
  return "Something went wrong. Please try again.";
}
