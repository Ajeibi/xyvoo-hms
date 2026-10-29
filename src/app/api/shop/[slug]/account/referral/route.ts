import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";
import type { Translator } from "@/lib/store/i18n/translate";
import { accountReferralSummary, ensureReferralCode, getReferralSettings } from "@/lib/store/referrals-server";
import { storefrontUrl } from "@/lib/store/subdomain";
import { formatShopCurrency } from "@/lib/shop/format";
import type { ReferralSettings } from "@/lib/store/referrals";
import { referralLink } from "@/lib/store/referral-link";
import { storeCurrency } from "@/lib/store/payout-routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** As friendOfferText and rewardText in referrals.ts, in the shopper's words. */
function friendOffer(t: Translator, s: ReferralSettings, money: (n: number) => string) {
  const off = s.friendKind === "percent" ? t("errors.acPercentOff", { value: String(s.friendValue) }) : t("errors.acAmountOff", { amount: money(s.friendValue) });
  return s.minOrder > 0 ? t("errors.acFriendOfferOver", { off, min: money(s.minOrder) }) : t("errors.acFriendOffer", { off });
}

function reward(t: Translator, s: Pick<ReferralSettings, "rewardKind" | "rewardValue">, money: (n: number) => string) {
  return s.rewardKind === "points" ? t("errors.acRewardPoints", { points: s.rewardValue }) : t("errors.acRewardGiftCard", { amount: money(s.rewardValue) });
}

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
    const t = await shopperT(req, slug, shop.tenant.id);
    const [code, stats] = await Promise.all([ensureReferralCode(shop.tenant.id, session.account.id, settings), accountReferralSummary(shop.tenant.id, session.account.id)]);
    if (!code) return NextResponse.json({ referral: null });
    return NextResponse.json(
      {
        referral: {
          code,
          link: referralLink(storefrontUrl(slug), code),
          friendOffer: friendOffer(t, settings, money),
          reward: reward(t, settings, money),
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
