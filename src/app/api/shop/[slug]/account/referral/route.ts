import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { accountReferralSummary, ensureReferralCode, getReferralSettings } from "@/lib/store/referrals-server";
import { storefrontUrl } from "@/lib/store/subdomain";
import { formatShopCurrency } from "@/lib/shop/format";
import { friendOfferText, rewardText } from "@/lib/store/referrals";
import { referralLink } from "@/lib/store/referral-link";
import { storeCurrency } from "@/lib/store/payout-routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * GET /api/shop/<store>/account/referral — the signed-in shopper's friend code,
 * what it gives and what they earn. Only on a device that confirmed the email
 * with a code, and only while the shop has referrals switched on.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "referral", 60);
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  if (!session?.verified) return NextResponse.json({ referral: null }, { headers: { "Cache-Control": "no-store" } });
  try {
    const settings = await getReferralSettings(shop.tenant.id);
    if (!settings.enabled) return NextResponse.json({ referral: null }, { headers: { "Cache-Control": "no-store" } });
    const currency = await storeCurrency(shop.tenant.id, createServerSupabaseClient());
    const money = (n: number) => formatShopCurrency(n, currency);
    const [code, stats] = await Promise.all([ensureReferralCode(shop.tenant.id, session.account.id, settings), accountReferralSummary(shop.tenant.id, session.account.id)]);
    if (!code) return NextResponse.json({ referral: null });
    return NextResponse.json(
      {
        referral: {
          code,
          link: referralLink(storefrontUrl(slug), code),
          friendOffer: friendOfferText(settings, money),
          reward: rewardText(settings, money),
          friends: stats.friends,
          pointsEarned: stats.points,
          giftCardsEarned: money(stats.giftCards),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("[referral] failed", error);
    return NextResponse.json({ referral: null });
  }
}
