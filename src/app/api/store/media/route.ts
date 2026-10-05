import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

const BUCKET = "store-products";

/**
 * GET /api/store/media?slug= — images this store has uploaded (product photos,
 * logos, banners), newest first, so they can be reused across the website.
 */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;

  const storage = resolved.service.storage.from(BUCKET);
  const { data, error } = await storage.list(resolved.access.tenantId, { limit: 300, sortBy: { column: "created_at", order: "desc" } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const images = (data || [])
    .filter((f) => f.id && /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f.name))
    .map((f) => ({
      name: f.name,
      url: storage.getPublicUrl(`${resolved.access.tenantId}/${f.name}`).data.publicUrl,
      createdAt: f.created_at,
    }));
  return NextResponse.json({ images });
}
