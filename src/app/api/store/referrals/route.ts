import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { referralSettingsSchema } from "@/lib/store/referrals";
import { getReferralSettings, referralOverview, saveReferralSettings } from "@/lib/store/referrals-server";
import { getLoyaltySettings } from "@/lib/store/loyalty-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can manage referrals." }, { status: 403 });

/** GET /api/store/referrals?slug= — settings and the rewards given so far. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const tenantId = resolved.access.tenantId;
  try {
    const [settings, overview, loyalty, { data: profile }] = await Promise.all([
      getReferralSettings(tenantId),
      referralOverview(tenantId),
      getLoyaltySettings(tenantId).catch(() => null),
      resolved.service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    return NextResponse.json({ settings, ...overview, loyaltyOn: Boolean(loyalty?.enabled), currency: profile?.currency_code || "NGN" });
  } catch (error) {
    console.error("[referrals] load failed", error);
    return NextResponse.json({ error: "We couldn't load referrals just now." }, { status: 500 });
  }
}

/** PUT /api/store/referrals { slug, enabled, friendKind, friendValue, minOrder, rewardKind, rewardValue, maxPerMonth } */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = referralSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the settings." }, { status: 400 });
  try {
    await saveReferralSettings(resolved.access.tenantId, parsed.data);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "referrals", action: parsed.data.enabled ? "settings" : "switched_off" });
    return NextResponse.json({ settings: parsed.data });
  } catch (error) {
    console.error("[referrals] save failed", error);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
