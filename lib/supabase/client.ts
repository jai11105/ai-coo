// Reusable browser Supabase client (Phase 2 connection layer).
//
// - Reads ONLY public, browser-safe env vars. Credentials are never hardcoded.
// - Uses the publishable key. NEVER use the service-role or any secret key here.
// - Owns session state; business workspace state (what the user can access)
//   lives in BusinessProvider + BusinessGate (business-context.tsx).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const rawPublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

const missingVars = [
  !rawUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
  !rawPublishableKey ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" : null,
].filter((v): v is string => v !== null);

if (missingVars.length > 0) {
  throw new Error(
    `[Supabase] Missing required environment variable(s): ${missingVars.join(", ")}. ` +
      `Add them to .env.local in the project root (see .env.example for the template) ` +
      `and restart the dev server. ` +
      `Browser code must only use the publishable key — never put SUPABASE_SERVICE_ROLE_KEY ` +
      `or any secret key in a NEXT_PUBLIC_* variable or in client-side code.`
  );
}

// Guaranteed non-empty strings by the guard above (this cast is safe:
// execution cannot reach here when either value is missing).
const supabaseUrl = rawUrl as string;
const supabasePublishableKey = rawPublishableKey as string;

let cachedClient: SupabaseClient | undefined;

/**
 * Returns the shared browser Supabase client (singleton).
 * Safe to call from any Client Component.
 */
export function createBrowserSupabaseClient(): SupabaseClient {
  if (!cachedClient) {
    cachedClient = createClient(supabaseUrl, supabasePublishableKey);
  }
  return cachedClient;
}

/** Shared browser Supabase client singleton. */
export const supabase = createBrowserSupabaseClient();
