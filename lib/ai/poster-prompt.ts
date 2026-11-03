// Business-aware poster prompt builder for Muse Image (server-only).
// Extracts authoritative business name/type/industry from verified server context,
// sanitizes user instructions, and enforces strict typography and privacy constraints.
// NEVER includes sales, profit, expenses, revenue, customer data, owner name, or financial numbers.

import { createClient } from "@supabase/supabase-js";
import { DATASET_PROFILES } from "@/lib/datasets";
import type { DemoDatasetKey } from "@/lib/types";

export interface PosterBusiness {
  name?: string;
  businessType?: string;
  industry?: string;
}

export interface ResolvePosterBusinessInput {
  businessId?: string | null;
  datasetKey?: string | null;
  authContext?: { businessName?: string } | null;
}

/**
 * Server-side business resolver: returns { name, businessType, industry } using
 * only server-trusted sources. Live mode reads from Supabase for the authorized businessId.
 * Demo mode reads from DATASET_PROFILES. On any failure returns null (never throws).
 */
export async function resolvePosterBusiness(
  input: ResolvePosterBusinessInput
): Promise<PosterBusiness | null> {
  try {
    const rawId = (input.businessId || "").trim();
    const isDemo =
      !rawId ||
      rawId === "demo" ||
      rawId.startsWith("demo:") ||
      (!process.env.SUPABASE_SERVICE_ROLE_KEY && Boolean(input.datasetKey));

    if (isDemo) {
      const key: DemoDatasetKey =
        input.datasetKey === "sample_business_2" || rawId === "demo:sample_business_2"
          ? "sample_business_2"
          : "meta_demo";
      const profile = DATASET_PROFILES[key];
      if (!profile) return null;
      return {
        name: profile.displayName || profile.name || undefined,
        businessType: profile.businessType || undefined,
        industry: profile.industry || undefined,
      };
    }

    // Live mode: authorized businessId supplied by server caller
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (!url || !serviceKey) {
      if (input.authContext?.businessName) {
        return { name: input.authContext.businessName };
      }
      return null;
    }

    const sb = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data, error } = await sb
      .from("businesses")
      .select("name, business_type, industry")
      .eq("id", rawId)
      .maybeSingle();

    if (error || !data) {
      if (input.authContext?.businessName) {
        return { name: input.authContext.businessName };
      }
      return null;
    }

    const name =
      typeof data.name === "string" && data.name.trim()
        ? data.name.trim()
        : input.authContext?.businessName;
    const businessType =
      typeof data.business_type === "string" && data.business_type.trim()
        ? data.business_type.trim()
        : undefined;
    const industry =
      typeof data.industry === "string" && data.industry.trim()
        ? data.industry.trim()
        : undefined;

    return {
      name: name || undefined,
      businessType,
      industry,
    };
  } catch {
    return null;
  }
}

export interface BuildPosterPromptInput {
  business?: PosterBusiness | null;
  userRequest: string;
}

/**
 * Builds a business-aware, safety-bounded prompt for Muse Image.
 * Hard capped to ~800 characters.
 */
export function buildPosterPrompt(input: BuildPosterPromptInput): string {
  const { business, userRequest } = input;

  // 1. Sanitize business name: strip control chars, quotes, max 60 chars
  const rawName = (business?.name || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);

  // 2. Sanitize and neutralize generic references in user request
  const sanitizedReq = (userRequest || "")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Neutralize generic business references (case-insensitive, whole phrases)
  // "for my/your/our/the business|shop|store|company|brand|restaurant|cafe|bakery|salon"
  // Tanglish forms: "en business", "en kadai", "namma business", "enga business", "enga kadai"
  let cleanedReq = sanitizedReq
    .replace(/\b(?:for|of)\s+(?:my|your|our|the)\s+(?:business|shop|store|company|brand|restaurant|cafe|bakery|salon)\b/gi, "")
    .replace(/\b(?:for|of\s+)?(?:en\s+business|en\s+kadai|namma\s+business|enga\s+business|enga\s+kadai)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  // Check if meaningful creative intent remains (occasion, offer, colors, style)
  const nonCommandText = cleanedReq
    .replace(/\b(give\s+me|make|create|design|generate|a|an|the|poster|creative|banner|image|photo|ad|advertisement|please)\b/gi, "")
    .trim();

  const finalUserIntent =
    nonCommandText.length > 0
      ? cleanedReq
      : "a professional promotional poster";

  // 3. Compose visual direction fitted to businessType and industry
  const bType = (business?.businessType || "").toLowerCase();
  const ind = (business?.industry || "").trim();

  let visualDirection = "Clean modern commercial promotional poster.";
  if (bType === "f&b" || bType.includes("food") || bType.includes("beverage")) {
    visualDirection = ind
      ? `Appetizing ${ind} presentation with warm, inviting styling.`
      : "Appetizing food and cafe presentation with warm, inviting culinary styling.";
  } else if (bType === "retail") {
    visualDirection = ind
      ? `Clean modern retail product showcase for ${ind}.`
      : "Clean modern retail product showcase with vibrant commercial lighting.";
  } else if (bType === "services") {
    visualDirection = ind
      ? `Clean professional ${ind} service visual with polished corporate aesthetic.`
      : "Clean professional service aesthetic with modern corporate styling.";
  } else if (bType === "manufacturing") {
    visualDirection = ind
      ? `High-quality industrial ${ind} showcase highlighting craftsmanship and scale.`
      : "High quality industrial showcase highlighting craftsmanship and durability.";
  } else if (ind) {
    visualDirection = `Clean modern commercial poster for ${ind}.`;
  }

  // 4. Extract short headline (at most 4 words) if user specified occasion or offer
  const OCCASION_OFFER_RE =
    /\b(?:(?:diwali|deepavali|pongal|onam|eid|christmas|new\s*year|holiday|festive|summer|winter|monsoon|spring|weekend|today|mega|flash|grand|special|exclusive|limited|annual)\s+)?(?:sale|offer|discount|deal|specials?|launch|promo|promotion|opening|exhibition|fest|season)\b/i;

  const occasionMatch = sanitizedReq.match(OCCASION_OFFER_RE);
  const headline = occasionMatch
    ? occasionMatch[0].split(/\s+/).slice(0, 4).join(" ")
    : null;

  // 5. Compose Text Rules
  let textRules: string;
  if (!rawName) {
    textRules = "Render NO text at all on the poster.";
  } else {
    textRules = `Text rules: render the business name exactly as "${rawName}" as the main title`;
    if (headline) {
      textRules += `, and at most one short headline: "${headline}"`;
    }
    textRules += `. No other text. Never print placeholder words like "Your Business", "Business Name", "Company", "Brand", or "Lorem ipsum". No paragraphs, prices, percentages, phone numbers, URLs, addresses, or invented discounts. Latin script only.`;
  }

  // 6. Assemble complete prompt and enforce ~800 character hard cap
  const creativeLinePrefix = "Creative direction: ";
  const staticPartsLength = visualDirection.length + 1 + creativeLinePrefix.length + 2 + textRules.length;
  const maxReqLength = Math.max(40, 800 - staticPartsLength);

  const boundedIntent =
    finalUserIntent.length > maxReqLength
      ? finalUserIntent.slice(0, maxReqLength).trim()
      : finalUserIntent;

  const prompt = `${visualDirection} ${creativeLinePrefix}${boundedIntent}. ${textRules}`;
  return prompt.slice(0, 820);
}

