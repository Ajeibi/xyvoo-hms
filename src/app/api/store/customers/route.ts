import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { customerKeySchema, customerNoteSchema, getCustomerOrders, listCustomers, saveCustomerNote, SEGMENT_HELP, SEGMENT_LABELS, SEGMENTS } from "@/lib/store/customers";
import { listCustomerGroups } from "@/lib/store/customer-groups-server";
import { featureUnavailable, getStorePlan, storeHasFeature } from "@/lib/store/features";

/**
 * GET /api/store/customers?slug=            all customers with their group
 * GET /api/store/customers?slug=&key=<key>  one customer's orders
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service, capabilities } = resolved;
  const blocked = await featureUnavailable(access.tenantId, "customers");
  if (blocked) return blocked;

  try {
    const key = url.searchParams.get("key");
    if (key !== null) {
      const parsed = customerKeySchema.safeParse(key);
      if (!parsed.success) return NextResponse.json({ error: "Unknown customer." }, { status: 400 });
      return NextResponse.json({ orders: await getCustomerOrders(access.tenantId, parsed.data) });
    }

    const [customers, groups, plan, { data: profile }] = await Promise.all([
      listCustomers(access.tenantId),
      listCustomerGroups(access.tenantId).catch(() => []),
      getStorePlan(access.tenantId),
      service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", access.tenantId).maybeSingle(),
    ]);
    const counts = Object.fromEntries(SEGMENTS.map((s) => [s, customers.filter((c) => c.segment === s).length]));
    return NextResponse.json({
      currency: profile?.currency_code || "NGN",
      customers,
      groups,
      canManageGroups: capabilities.canManageSettings,
      segments: SEGMENTS.map((s) => ({ key: s, label: SEGMENT_LABELS[s], help: SEGMENT_HELP[s], count: counts[s] })),
      canExport: capabilities.canManageSettings && storeHasFeature(plan, "customerExport"),
    });
  } catch (error) {
    console.error("[customers] failed", error);
    return NextResponse.json({ error: "We couldn't load your customers just now." }, { status: 500 });
  }
}

/** PATCH /api/store/customers { slug, key, tags, note } — the shop's own tags and notes on a customer. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const blocked = await featureUnavailable(resolved.access.tenantId, "customers");
  if (blocked) return blocked;

  const parsed = customerNoteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the note." }, { status: 400 });
  await saveCustomerNote(resolved.access.tenantId, parsed.data);
  return NextResponse.json({ ok: true });
}
