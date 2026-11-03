// GET /api/copilot/traces — recent in-memory execution traces (diagnostics).
// Slice 8: requires authenticated tenant scope; never returns cross-tenant
// traces. Unauthenticated callers get 401 (no open fallback).
import { NextResponse } from "next/server";
import { recentTraces } from "@/lib/ai/types";
import { getAuthorizedBusinessContext, httpStatus } from "@/lib/ai/server-context";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    let ctx: { businessId: string } | null = null;
    try {
      ctx = await getAuthorizedBusinessContext(req);
    } catch (e) {
      const status = httpStatus(e, 401);
      const code = status === 403 ? "FORBIDDEN" : "UNAUTHENTICATED";
      return NextResponse.json(
        { error: { code, message: e instanceof Error ? e.message : "Sign-in required." } },
        { status },
      );
    }
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || "20"), 50));
    const all = recentTraces(limit);
    const scoped = all.filter((t) => t.businessId === ctx!.businessId);
    return NextResponse.json({ data: { traces: scoped }, meta: { timestamp: new Date().toISOString() } });
  } catch (e) {
    const status = httpStatus(e, 500);
    return NextResponse.json(
      { error: { code: "TRACES_FAILED", message: e instanceof Error ? e.message : "Failed." } },
      { status },
    );
  }
}
