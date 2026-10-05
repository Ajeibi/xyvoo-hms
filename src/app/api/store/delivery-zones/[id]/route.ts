import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { deliveryZoneSchema, mapDeliveryZone, toDeliveryZoneRow, type DeliveryZoneRow } from "@/lib/store/delivery";

const COLUMNS = "id, name, regions, fee, free_over, eta_text, is_pickup, is_active, sort_order";

async function authorise(body: unknown) {
  const slug = typeof (body as { slug?: unknown })?.slug === "string" ? (body as { slug: string }).slug : "";
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved;
  if (!resolved.capabilities.canManageSettings) {
    return { error: NextResponse.json({ error: "Only the owner or an admin can change delivery." }, { status: 403 }) };
  }
  return resolved;
}

/** PATCH /api/store/delivery-zones/<id> { slug, ...zone } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await authorise(body);
  if (resolved.error) return resolved.error;

  const parsed = deliveryZoneSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });

  const { data, error } = await resolved.service
    .schema("store")
    .from("delivery_zones")
    .update(toDeliveryZoneRow(parsed.data))
    .eq("id", (await params).id)
    .eq("tenant_id", resolved.access.tenantId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Delivery option not found." }, { status: 404 });
  return NextResponse.json({ zone: mapDeliveryZone(data as DeliveryZoneRow) });
}

/** DELETE /api/store/delivery-zones/<id>?slug= */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await authorise({ slug: new URL(req.url).searchParams.get("slug") });
  if (resolved.error) return resolved.error;
  const { error } = await resolved.service.schema("store").from("delivery_zones").delete().eq("id", (await params).id).eq("tenant_id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
