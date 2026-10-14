import { NextResponse } from "next/server";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { recordClick } from "@/lib/store/campaigns-server";
import { storefrontUrl } from "@/lib/store/subdomain";

/**
 * GET /api/shop/<store>/m/c/<token>/<n> — a link in a campaign email. Counts the
 * click, then goes to the n-th link saved with that campaign. It can't go
 * anywhere else, so it can't be used to send people to another site.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string; token: string; index: string }> }) {
  const { slug, token, index } = await params;
  let target: string | null = null;
  try {
    const tenant = await getShopTenantBySlug(slug);
    if (tenant) target = await recordClick(tenant.id, token, Number(index));
  } catch (error) {
    console.error("[campaign click] failed", error);
  }
  return NextResponse.redirect(target || storefrontUrl(slug), 302);
}
