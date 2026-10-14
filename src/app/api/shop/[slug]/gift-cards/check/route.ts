import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { checkGiftCard } from "@/lib/store/gift-cards";

const BodySchema = z.object({ code: z.string().trim().min(1, "Enter your gift card code.").max(40) });

/**
 * POST /api/shop/<store>/gift-cards/check { code } — what's left on a gift
 * card, so checkout can show it before the order is placed. Kept to a few
 * tries per visitor, so codes can't be guessed.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "gift-card-check", 10);
  if (shop.error) return shop.error;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Enter your gift card code." }, { status: 400 });

  const result = await checkGiftCard(shop.tenant.id, parsed.data.code);
  if (!result.ok) return NextResponse.json({ error: result.message }, { status: 404 });
  return NextResponse.json({ code: result.code, balance: result.balance, currency: result.currency, expiresAt: result.expiresAt });
}
