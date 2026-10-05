import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { deliveryZoneSchema, mapDeliveryZone, toDeliveryZoneRow, type DeliveryZoneRow } from "@/lib/store/delivery";

const COLUMNS = "id, name, regions, fee, free_over, eta_text, is_pickup, is_active, sort_order";

/** GET /api/store/delivery-zones?slug= — the store's delivery options. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { data, error } = await resolved.service
    .schema("store")
    .from("delivery_zones")
    .select(COLUMNS)
    .eq("tenant_id", resolved.access.tenantId)
    .order("sort_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zones: ((data || []) as DeliveryZoneRow[]).map(mapDeliveryZone), canManage: resolved.capabilities.canManageSettings });
}

/** POST /api/store/delivery-zones { slug, ...zone } — adds a delivery option. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change delivery." }, { status: 403 });

  const parsed = deliveryZoneSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });

  const { count } = await resolved.service.schema("store").from("delivery_zones").select("id", { count: "exact", head: true }).eq("tenant_id", resolved.access.tenantId);
  const { data, error } = await resolved.service
    .schema("store")
    .from("delivery_zones")
    .insert({ tenant_id: resolved.access.tenantId, sort_order: count ?? 0, ...toDeliveryZoneRow(parsed.data) })
    .select(COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ zone: mapDeliveryZone(data as DeliveryZoneRow) }, { status: 201 });
}
