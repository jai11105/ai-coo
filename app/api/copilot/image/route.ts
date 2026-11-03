// POST /api/copilot/image — explicit creative generation only.
// Auth/demo mirrors /api/copilot/chat scope handling; never auto-generates;
// never charts/dashboards. Slice 8: rate-limited, tenant-scoped asset
// metadata tracked (no bucket invented — see lib/ai/image-assets.ts).
import { NextResponse } from "next/server";
import { DATASET_PROFILES } from "@/lib/datasets";
import type { DemoDatasetKey } from "@/lib/types";
import { generateCopilotImage, validateImageRequest } from "@/lib/ai/image";
import { getAuthorizedBusinessContext, httpStatus } from "@/lib/ai/server-context";
import { checkRateLimit, rateKey, IMAGE_LIMIT, IMAGE_WINDOW_MS } from "@/lib/ai/rate-limit";
import { recordImageAsset, imageStorageStatus } from "@/lib/ai/image-assets";
void imageStorageStatus;

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as {
      prompt?: unknown;
      size?: unknown;
      businessId?: unknown;
      datasetKey?: unknown;
    } | null;

    const prompt = typeof body?.prompt === "string" ? body.prompt : "";
    const size = typeof body?.size === "string" ? body.size : "1024x1024";

    if (!prompt.trim()) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: "Describe the creative you want." } },
        { status: 400 }
      );
    }

    // Server-side authorization matching /api/copilot/chat:
    // Never trust client-supplied business id or name directly.
    const hasAuth = Boolean((req.headers.get("authorization") || "").startsWith("Bearer "));
    const rawBusiness = typeof body?.businessId === "string" ? body.businessId.trim() : "";
    let businessId = rawBusiness;
    let userId: string | null = null;
    let conversationScope = "demo";
    let datasetKey: DemoDatasetKey | undefined = undefined;
    let authContext: { businessName?: string } | undefined = undefined;

    if (!hasAuth || !rawBusiness || rawBusiness === "demo") {
      datasetKey = body?.datasetKey === "sample_business_2" ? "sample_business_2" : "meta_demo";
      businessId = `demo:${datasetKey}`;
      void DATASET_PROFILES[datasetKey];
    } else {
      const ctx = await getAuthorizedBusinessContext(req);
      businessId = ctx.businessId;
      userId = ctx.userId;
      conversationScope = ctx.businessId;
      authContext = { businessName: ctx.businessName };
    }

    const rl = checkRateLimit(rateKey("image", userId, conversationScope), IMAGE_LIMIT, IMAGE_WINDOW_MS);
    if (!rl.ok) {
      return NextResponse.json(
        { error: { code: "RATE_LIMITED", message: "Too many image requests. Please wait a moment." } },
        { status: 429 }
      );
    }

    const v = validateImageRequest({ prompt, businessId, size });
    if (!v.ok) {
      return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: v.error } }, { status: 400 });
    }

    const r = await generateCopilotImage({
      prompt: v.prompt || prompt,
      businessId,
      size: v.size,
      datasetKey,
      authContext,
    });

    if (!r.ok) {
      return NextResponse.json({ error: { code: "IMAGE_FAILED", message: r.error } }, { status: 502 });
    }

    const asset = recordImageAsset({
      userId,
      businessId,
      conversationId: "",
      prompt: v.prompt || prompt,
      revisedPrompt: r.revisedPrompt,
      provider: r.provider || "meta-image",
      size: v.size || "1024x1024",
      imageUrl: r.imageUrl,
      hasB64: Boolean(r.b64),
    });

    return NextResponse.json({
      data: {
        imageUrl: r.imageUrl,
        b64: r.b64 ? r.b64.slice(0, 32) + "…" : undefined,
        imageBase64: r.b64,
        revisedPrompt: r.revisedPrompt,
        provider: r.provider,
        assetId: asset.id,
        persistent: false,
      },
      meta: { timestamp: new Date().toISOString() },
    });
  } catch (e) {
    return NextResponse.json(
      { error: { code: "IMAGE_FAILED", message: e instanceof Error ? e.message : "Image generation failed." } },
      { status: httpStatus(e, 500) }
    );
  }
}
