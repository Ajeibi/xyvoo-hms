import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { wholesaleSettingsSchema } from "@/lib/store/wholesale";
import { getWholesaleSettings, listTradeAccounts, saveWholesaleSettings } from "@/lib/store/wholesale-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can manage trade accounts." }, { status: 403 });

/** GET /api/store/wholesale?slug= — settings and every trade application. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const tenantId = resolved.access.tenantId;
  try {
    const [settings, accounts, { data: profile }] = await Promise.all([
      getWholesaleSettings(tenantId),
      listTradeAccounts(tenantId),
      resolved.service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    return NextResponse.json({ settings, accounts, currency: profile?.currency_code || "NGN" });
  } catch (error) {
    console.error("[wholesale] load failed", error);
    return NextResponse.json({ error: "We couldn't load trade accounts just now." }, { status: 500 });
  }
}

/** PUT /api/store/wholesale { slug, enabled, minOrder, allowDiscounts } */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = wholesaleSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the settings." }, { status: 400 });
  try {
    await saveWholesaleSettings(resolved.access.tenantId, parsed.data);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "wholesale", action: parsed.data.enabled ? "settings" : "switched_off" });
    return NextResponse.json({ settings: parsed.data });
  } catch (error) {
    console.error("[wholesale] save failed", error);
    return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  }
}
