import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { priceBasketLines } from "@/lib/store/discounts-server";
import { getTaxSettings } from "@/lib/store/tax-server";
import { lineTaxRate } from "@/lib/store/tax";

const BodySchema = z.object({
  items: z
    .array(z.object({ productId: z.string().uuid(), variantId: z.string().uuid().nullable().optional(), quantity: z.number().int().positive().max(999) }))
    .min(1)
    .max(50),
});

/**
 * POST /api/shop/<store>/basket { items } — today's price of each basket line
 * (a sale may have started or ended since it was added) and the tax rate that
 * applies to it, so the checkout page shows what the order will really cost.
 * Checkout works every amount out again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getShopTenantBySlug(slug);
  if (!tenant || !(await isShopLive(tenant.id))) return NextResponse.json({ error: "Shop not found." }, { status: 404 });
  const limit = await rateLimitShared(`basket:${tenant.id}:${clientIp(req)}`, 60, 10 * 60_000);
  if (!limit.ok) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Your basket couldn't be read." }, { status: 400 });

  const [lines, tax] = await Promise.all([priceBasketLines(tenant.id, parsed.data.items), getTaxSettings(tenant.id)]);
  return NextResponse.json({
    lines: lines.map((l) => ({ productId: l.productId, variantId: l.variantId, unitPrice: l.unitPrice, taxRate: lineTaxRate(tax, l) })),
  });
}
