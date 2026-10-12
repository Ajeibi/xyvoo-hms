import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { mapTaxSettings, TAX_COLUMNS, taxSettingsSchema, toTaxRow, type TaxSettingsRow } from "@/lib/store/tax";
import { logActivity } from "@/lib/store/activity";
import type { SupabaseClient } from "@supabase/supabase-js";

/** How many of the shop's products there are, and how many are set to charge VAT. */
async function productTaxCounts(service: SupabaseClient, tenantId: string) {
  const products = () => service.schema("store").from("products").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId);
  const [all, charging] = await Promise.all([products(), products().eq("taxable", true)]);
  return { total: all.count ?? 0, charging: charging.count ?? 0 };
}

/** Missing tax columns mean the database hasn't been updated yet. */
const notReady = () => NextResponse.json({ error: "Tax settings aren't ready on your shop just yet. Please try again later." }, { status: 503 });

/** GET /api/store/tax?slug= — the shop's tax settings. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { data, error } = await resolved.service
    .schema("store")
    .from("business_profile")
    .select(`${TAX_COLUMNS}, country_code`)
    .eq("tenant_id", resolved.access.tenantId)
    .maybeSingle();
  if (error) {
    console.error("[tax] load failed", error);
    if (error.code === "42703") return notReady();
    return NextResponse.json({ error: "We couldn't load your tax settings. Please refresh the page." }, { status: 500 });
  }
  const row = data as (TaxSettingsRow & { country_code: string | null }) | null;
  return NextResponse.json({
    // The rate is kept even when tax is switched off, so switching back on remembers it.
    settings: { ...mapTaxSettings(row), enabled: Boolean(row?.tax_enabled), rate: Number(row?.tax_rate) || 0 },
    countryCode: row?.country_code ?? "NG",
    canManage: resolved.capabilities.canManageSettings,
    products: await productTaxCounts(resolved.service, resolved.access.tenantId),
  });
}

/** POST /api/store/tax { slug, action: "charge-all" } — sets every product to charge VAT. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change tax settings." }, { status: 403 });
  if (body?.action !== "charge-all") return NextResponse.json({ error: "Unknown action." }, { status: 400 });

  const tenantId = resolved.access.tenantId;
  const { data, error } = await resolved.service.schema("store").from("products").update({ taxable: true }).eq("tenant_id", tenantId).eq("taxable", false).select("id");
  if (error) {
    console.error("[tax] charge-all failed", error);
    return NextResponse.json({ error: "We couldn't update your products. Please try again." }, { status: 500 });
  }
  const changed = data?.length ?? 0;
  if (changed) {
    await logActivity({ tenantId, actor: resolved.access, area: "settings", action: "updated", targetLabel: "VAT on products", changes: { products_charging_vat: { from: "some", to: `all (${changed} changed)` } } });
  }
  return NextResponse.json({ changed, products: await productTaxCounts(resolved.service, tenantId) });
}

/** PATCH /api/store/tax { slug, enabled, name, rate, inclusive, number, onDelivery } — saves them. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change tax settings." }, { status: 403 });

  const parsed = taxSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });

  const { data, error } = await resolved.service
    .schema("store")
    .from("business_profile")
    .update(toTaxRow(parsed.data))
    .eq("tenant_id", resolved.access.tenantId)
    .select(TAX_COLUMNS)
    .maybeSingle();
  if (error) {
    console.error("[tax] save failed", error);
    if (error.code === "42703") return notReady();
    return NextResponse.json({ error: "We couldn't save your tax settings. Please try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Finish setting up your shop's details first, then come back to tax." }, { status: 404 });
  const row = data as unknown as TaxSettingsRow;
  return NextResponse.json({ settings: { ...mapTaxSettings(row), enabled: Boolean(row.tax_enabled), rate: Number(row.tax_rate) || 0 } });
}
