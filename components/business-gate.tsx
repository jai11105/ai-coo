"use client";

// Route guard for live workspaces (Phase 3 · Task C).
//
// - Demo/mock-only sessions (no Supabase user) bypass: demo datasets keep
//   working exactly as before.
// - Signed-in users with zero memberships → /business/new.
// - Signed-in users with several memberships and no active pick → /business.
// - Single membership is auto-selected by BusinessProvider, so it passes.
// - /business and /business/new themselves are exempt (they render alone).

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useBusiness } from "./business-context";

export function BusinessGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { userId, memberships, activeBusinessId, loading, error, refresh } = useBusiness();

  const exempt =
    pathname === "/business" ||
    pathname === "/business/new" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/recover-email";

  useEffect(() => {
    // Never redirect while loading OR when the membership fetch failed:
    // an error must surface the retry UI, never a silent onboarding bounce.
    if (exempt || !userId || loading || error) return;
    if (memberships.length === 0) router.replace("/business/new");
    else if (memberships.length > 1 && !activeBusinessId) router.replace("/business");
  }, [exempt, userId, loading, error, memberships.length, activeBusinessId, router]);

  // Demo/mock sessions and the onboarding routes render without gating.
  if (!userId || exempt) return <>{children}</>;

  if (loading) {
    return (
      <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-500">
        Loading your workspace…
      </p>
    );
  }

  // Membership load failed: NEVER treat as no-membership. Show the error
  // with a retry so the user is not silently bounced to onboarding.
  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Couldn&apos;t load your workspaces.</p>
        <p className="mt-1 text-xs text-slate-500" role="alert">{error}</p>
        <button className="btn-secondary mt-4 w-full" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    );
  }

  if (memberships.length === 0 || (memberships.length > 1 && !activeBusinessId)) {
    return (
      <p className="mx-auto max-w-md px-4 py-16 text-center text-sm text-slate-500">
        Opening your workspace…
      </p>
    );
  }

  return <>{children}</>;
}
