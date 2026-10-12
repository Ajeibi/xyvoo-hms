import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { diffFields, logActivity } from "@/lib/store/activity";
import { featureUnavailable, getStorePlan, storeHasFeature } from "@/lib/store/features";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { currencySettingsSchema, liveRate, parseCurrencySettings, SHOP_CURRENCIES } from "@/lib/store/currencies";
import { getFxRates } from "@/lib/store/fx-rates";

async function homeAndSettings(service: ReturnType<typeof createServerSupabaseClient>, tenantId: string) {
  const { data } = await service.schema("store").from("business_profile").select("currency_code, currencies").eq("tenant_id", tenantId).maybeSingle();
  const home = (data?.currency_code as string | undefined) || "NGN";
  return { home, settings: parseCurrencySettings(data?.currencies, home) };
}

/**
 * GET /api/store/currencies?slug= — the shop's extra currencies, with today's
 * reference rate for each (home-currency units to one unit) for previews.
 */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const [{ home, settings }, fx, plan] = await Promise.all([
    homeAndSettings(resolved.service, resolved.access.tenantId),
    getFxRates(),
    getStorePlan(resolved.access.tenantId),
  ]);
  const liveRates = Object.fromEntries(
    SHOP_CURRENCIES.filter((c) => c !== home).map((code) => [code, liveRate(fx.rates, home, code)]),
  );
  const available = storeHasFeature(plan, "multiCurrency");
  return NextResponse.json({
    homeCurrency: home,
    // On Free the saved currencies are kept (nothing is deleted) but not offered or used.
    settings: available ? settings : { extra: [] },
    liveRates,
    ratesUpdatedAt: fx.fetchedAt,
    canManage: resolved.capabilities.canManageSettings,
    available,
    savedWhileUnavailable: available ? 0 : settings.extra.length,
  });
}

/** PATCH /api/store/currencies { slug, settings } — owner or admin. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the owner or an admin can change your shop's currencies." }, { status: 403 });
  }

  const blocked = await featureUnavailable(resolved.access.tenantId, "multiCurrency");
  if (blocked) return blocked;

  const parsed = currencySettingsSchema.safeParse(body?.settings);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the currency settings." }, { status: 400 });

  const { home, settings: previous } = await homeAndSettings(resolved.service, resolved.access.tenantId);
  const settings = parseCurrencySettings(parsed.data, home);
  const { error } = await resolved.service
    .schema("store")
    .from("business_profile")
    .update({ currencies: settings })
    .eq("tenant_id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  const codes = (s: typeof settings) => s.extra.map((c) => c.code);
  await logActivity({
    tenantId: resolved.access.tenantId,
    actor: resolved.access,
    area: "currencies",
    action: "updated",
    changes: diffFields({ currencies: codes(previous) }, { currencies: codes(settings) }),
  });
  return NextResponse.json({ settings });
}
