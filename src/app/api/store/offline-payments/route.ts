import { shopChanged } from "@/lib/store/site/shop-changed";
import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { logActivity } from "@/lib/store/activity";
import { offlinePaymentsSchema, parseOfflinePayments } from "@/lib/store/offline-payments";

/** GET /api/store/offline-payments?slug= — the shop's bank transfer, pay-on-delivery and WhatsApp order settings. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { data } = await resolved.service
    .schema("store")
    .from("business_profile")
    .select("offline_payments, whatsapp")
    .eq("tenant_id", resolved.access.tenantId)
    .maybeSingle();
  return NextResponse.json({
    settings: parseOfflinePayments(data?.offline_payments),
    whatsappNumber: (data?.whatsapp as string | null) ?? null,
    canManage: resolved.capabilities.canManageSettings,
  });
}

/** PATCH /api/store/offline-payments { slug, settings } — owner or admin. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "Only the owner or an admin can change how customers pay." }, { status: 403 });
  }

  const parsed = offlinePaymentsSchema.safeParse(body?.settings);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the payment details." }, { status: 400 });

  const { error } = await resolved.service
    .schema("store")
    .from("business_profile")
    .update({ offline_payments: parsed.data })
    .eq("tenant_id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: "We couldn't save that. Please try again." }, { status: 500 });
  await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "payments", action: "updated" });
  shopChanged(resolved.access.tenantId);
  return NextResponse.json({ settings: parsed.data });
}
