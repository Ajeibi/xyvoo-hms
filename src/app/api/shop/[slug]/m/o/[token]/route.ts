import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { recordOpen } from "@/lib/store/campaigns-server";

// A 1x1 transparent GIF.
const PIXEL = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** GET /api/shop/<store>/m/o/<token> — the tiny picture in a campaign email; loading it counts as an open. */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  try {
    const tenant = await getShopTenantBySlug(slug);
    if (tenant) await recordOpen(tenant.id, token);
  } catch (error) {
    console.error("[campaign open] failed", error);
  }
  return new Response(PIXEL, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0" } });
}
