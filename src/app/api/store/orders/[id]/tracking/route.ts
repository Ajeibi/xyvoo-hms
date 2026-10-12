import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { recordOrderEvent } from "@/lib/store/order-events";

const trackingSchema = z.object({
  slug: z.string(),
  number: z.string().trim().max(100),
  carrier: z.string().trim().max(100),
});

/** PATCH /api/store/orders/<id>/tracking { slug, number, carrier } — the delivery tracking details. Empty clears them. Any team member. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const parsed = trackingSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Tracking numbers and carrier names can be up to 100 characters." }, { status: 400 });

  const { tenantId, userId, currentUserName } = resolved.access;
  const number = parsed.data.number || null;
  const carrier = parsed.data.carrier || null;
  const { data, error } = await resolved.service
    .schema("store")
    .from("orders")
    .update({ tracking_number: number, tracking_carrier: carrier, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[order tracking] not saved", { orderId: id, error: error.message });
    return NextResponse.json({ error: "We couldn't save the tracking details. Please try again." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  await recordOrderEvent(
    tenantId,
    id,
    {
      kind: "tracking",
      message: number ? `Tracking number ${number}${carrier ? ` (${carrier})` : ""}` : "Tracking details removed",
      data: { number, carrier },
    },
    { userId, name: currentUserName },
  );
  return NextResponse.json({ ok: true });
}
