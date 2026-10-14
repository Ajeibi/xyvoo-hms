import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { loyaltySettingsSchema } from "@/lib/store/loyalty";
import { getLoyaltySettings, loyaltyOverview, saveLoyaltySettings } from "@/lib/store/loyalty-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can manage loyalty points." }, { status: 403 });

/** GET /api/store/loyalty?slug= — settings, the figures at the top and everyone with points. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const tenantId = resolved.access.tenantId;
  try {
    const [settings, overview, { data: profile }] = await Promise.all([
      getLoyaltySettings(tenantId),
      loyaltyOverview(tenantId),
      resolved.service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    return NextResponse.json({ settings, ...overview, currency: profile?.currency_code || "NGN" });
  } catch (error) {
    console.error("[loyalty] load failed", error);
    return NextResponse.json({ error: "We couldn't load loyalty points just now." }, { status: 500 });
  }
}

/** PUT /api/store/loyalty { slug, enabled, pointsPer100, pointValue, minRedeem, expiryMonths } */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = loyaltySettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the settings." }, { status: 400 });
  try {
    await saveLoyaltySettings(resolved.access.tenantId, parsed.data);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "loyalty", action: parsed.data.enabled ? "settings" : "switched_off" });
    return NextResponse.json({ settings: parsed.data });
  } catch (error) {
    console.error("[loyalty] save failed", error);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
