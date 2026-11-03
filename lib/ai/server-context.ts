// Server-side business context + auth (Layer 2, server half).
// NEVER trusts client business IDs blindly: verifies membership via
// Supabase (service-role, server-only) and loads authoritative settings.
// Secrets stay server-side. No .env.local modification.

import { createClient } from "@supabase/supabase-js";

export interface ServerBusinessContext {
  userId: string;
  businessId: string;
  businessName: string;
  currency: string;
  timezone: string;
  role: string;
}

function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !serviceKey) throw new Error("Supabase server credentials are not configured.");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/** Verify JWT → user, then membership → business. Throws with status. */
export async function getAuthorizedBusinessContext(req: Request): Promise<ServerBusinessContext> {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const headerBusiness = (req.headers.get("x-business-id") || "").trim();
  if (!token) {
    const e = new Error("Missing or expired sign-in. Please log in again.");
    (e as unknown as { status?: number }).status = 401;
    throw e;
  }
  const sb = serverSupabase();
  const { data: userData, error: userErr } = await sb.auth.getUser(token);
  if (userErr || !userData?.user) {
    const e = new Error("Invalid or expired sign-in. Please log in again.");
    (e as unknown as { status?: number }).status = 401;
    throw e;
  }
  const userId = userData.user.id;

  let bodyBusiness = "";
  try {
    const clone = req.clone();
    const body = (await clone.json().catch(() => null)) as { businessId?: unknown } | null;
    if (body && typeof body.businessId === "string") bodyBusiness = body.businessId.trim();
  } catch { /* body may be empty/non-JSON */ }
  const businessId = bodyBusiness || headerBusiness;
  if (!businessId) {
    const e = new Error("Business context is required.");
    (e as unknown as { status?: number }).status = 400;
    throw e;
  }

  const { data: member, error: memErr } = await sb
    .from("business_members")
    .select("business_id, role, status")
    .eq("business_id", businessId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (memErr || !member) {
    const e = new Error("Business not found or access denied.");
    (e as unknown as { status?: number }).status = 403;
    throw e;
  }

  const { data: biz } = await sb
    .from("businesses")
    .select("id,name,currency_code,timezone")
    .eq("id", businessId)
    .maybeSingle();

  return {
    userId,
    businessId,
    businessName: (biz as { name?: string } | null)?.name || "Your business",
    currency: (biz as { currency_code?: string } | null)?.currency_code || "INR",
    timezone: (biz as { timezone?: string } | null)?.timezone || "UTC",
    role: (member as { role?: string }).role || "viewer",
  };
}

export function httpStatus(e: unknown, fallback = 500): number {
  const s = (e as unknown as { status?: number } | null)?.status;
  return typeof s === "number" ? s : fallback;
}
