import { NextResponse } from "next/server";
import { z } from "zod";
import { getShopTenantBySlug } from "@/lib/shop/tenants";
import { isShopLive } from "@/lib/store/site/data";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { priceBasketLines } from "@/lib/store/discounts-server";
import { getTaxSettings } from "@/lib/store/tax-server";
import { lineTaxRate } from "@/lib/store/tax";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { tradeUnitPrice } from "@/lib/store/wholesale";
import { activeTrade, tradePricing } from "@/lib/store/wholesale-server";

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

  const [lines, tax, { data: weights }] = await Promise.all([
    priceBasketLines(tenant.id, parsed.data.items),
    getTaxSettings(tenant.id),
    createServerSupabaseClient()
      .schema("store")
      .from("products")
      .select("id, weight_kg")
      .eq("tenant_id", tenant.id)
      .in("id", [...new Set(parsed.data.items.map((i) => i.productId))]),
  ]);
  const weightFor = new Map((weights || []).map((r) => [r.id as string, Number(r.weight_kg) || 0]));

  // A confirmed trade customer sees their trade prices.
  const trade = await activeTrade(tenant.id, await getCustomerSession(tenant.id).catch(() => null)).catch(() => null);
  const pricing = trade ? await tradePricing(tenant.id, lines.map((l) => l.productId)).catch(() => null) : null;
  const qtyFor = (l: { productId: string; variantId: string | null }) => parsed.data.items.filter((i) => i.productId === l.productId && (i.variantId ?? null) === l.variantId).reduce((n, i) => n + i.quantity, 0);
  return NextResponse.json({
    trade: Boolean(trade),
    lines: lines.map((l) => {
      const p = pricing?.get(l.productId);
      const unitPrice = p ? tradeUnitPrice({ unit: l.unitPrice, productPrice: p.productPrice, wholesalePrice: p.wholesalePrice, minQty: p.minQty, quantity: qtyFor(l) }) : l.unitPrice;
      return { productId: l.productId, variantId: l.variantId, unitPrice, taxRate: lineTaxRate(tax, l), weightKg: weightFor.get(l.productId) ?? 0 };
    }),
  });
}
