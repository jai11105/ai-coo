// Slice 8 — generated-image asset registry (metadata only, no bucket invented).
// Storage audit (Nov 2026): repo has NO supabase storage usage and NO bucket
// migration. Per Slice 8 §4, no bucket is invented here. Generation metadata
// is tracked in-memory AND best-effort persisted into copilot_image_assets
// (migration 010) with explicit membership checks; routes report honestly.
export interface ImageAssetInput {
  userId: string | null; businessId: string | null;
  conversationId: string; prompt: string; revisedPrompt?: string;
  provider: string; size: string; imageUrl?: string; hasB64: boolean;
}
export interface ImageAssetRecord extends ImageAssetInput {
  id: string; createdAt: string; persisted: boolean;
}
const MEM: ImageAssetRecord[] = [];
export function recordImageAsset(input: ImageAssetInput): ImageAssetRecord {
  const rec: ImageAssetRecord = {
    ...input,
    prompt: (input.prompt || "").slice(0, 1000),
    id: `img_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    persisted: false,
  };
  MEM.push(rec);
  if (MEM.length > 100) MEM.splice(0, MEM.length - 100);
  // Best-effort durable write for live tenant scope (never throws).
  try {
    void persistImageAsset(rec);
  } catch { /* ignore */ }
  return rec;
}
async function persistImageAsset(rec: ImageAssetRecord): Promise<void> {
  try {
    if (!rec.userId || !rec.businessId) return;
    if (String(rec.businessId).startsWith("demo:")) return;
    const store = await import("./conversation-store");
    const ok = await store.assertMember(rec.userId, rec.businessId);
    if (!ok) return;
    const sb = store.serverStoreClient();
    if (!sb) return;
    const { data, error } = await sb.from("copilot_image_assets").insert({
      user_id: rec.userId,
      business_id: rec.businessId,
      conversation_id: (rec.conversationId || "").slice(0, 80),
      prompt: rec.prompt,
      revised_prompt: (rec.revisedPrompt || "").slice(0, 1000) || null,
      provider: rec.provider.slice(0, 80),
      size: rec.size.slice(0, 24),
      image_url: (rec.imageUrl || "").slice(0, 2000) || null,
      has_b64: rec.hasB64,
    }).select("id").single();
    if (!error && data) rec.persisted = true;
  } catch { /* best-effort */ }
}
export function recentImageAssets(businessId: string | null, limit = 20): ImageAssetRecord[] {
  const scoped = businessId ? MEM.filter((m) => m.businessId === businessId) : MEM.slice();
  return scoped.slice(-Math.max(1, Math.min(limit, 100)));
}
export function imageStorageStatus(): { bucketInvented: boolean; persistent: boolean; note: string } {
  return {
    bucketInvented: false,
    persistent: false,
    note: "No Supabase storage bucket exists in this repo; image bytes are returned inline (base64/URL). Metadata is tracked in-memory + best-effort copilot_image_assets rows (no private-asset public URLs). Persistent gallery requires a reviewed bucket migration (not invented in Slice 8).",
  };
}
