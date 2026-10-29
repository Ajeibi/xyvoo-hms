import { NextResponse } from "next/server";
import { z } from "zod";
import { FB_RATE_LIMITS } from "@/lib/hms/fb-bill-rules";
import { getTenantFbSettings, upsertTenantFbBillRates } from "@/lib/hms/fb-settings";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const Schema = z.object({
  slug: z.string().min(1),
  serviceChargePercent: z.coerce.number().min(0).max(FB_RATE_LIMITS.service, `Service charge can be up to ${FB_RATE_LIMITS.service}%.`),
  levyPercent: z.coerce.number().min(0).max(FB_RATE_LIMITS.levy, `The levy can be up to ${FB_RATE_LIMITS.levy}%.`),
  vatPercent: z.coerce.number().min(0).max(FB_RATE_LIMITS.vat, `VAT can be up to ${FB_RATE_LIMITS.vat}%.`),
  pricesIncludeTax: z.boolean(),
});

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const auth = await requireFbApi(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const settings = await getTenantFbSettings(auth.service, auth.tenant.id);
  return NextResponse.json({ billRates: settings.billRates });
}

/** Saves service charge, levy and VAT for bills opened from now on. Open bills keep their rates. */
export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const before = await getTenantFbSettings(auth.service, auth.tenant.id);
    const after = await upsertTenantFbBillRates(auth.service, auth.tenant.id, {
      service_charge_percent: body.serviceChargePercent,
      levy_percent: body.levyPercent,
      vat_percent: body.vatPercent,
      prices_include_tax: body.pricesIncludeTax,
    });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "fb_bill_rates_changed",
      entityType: "tenant_fb_settings",
      entityId: auth.tenant.id,
      before: before.billRates,
      after: after.billRates,
    });
    return NextResponse.json({ ok: true, billRates: after.billRates });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 400 });
  }
}
