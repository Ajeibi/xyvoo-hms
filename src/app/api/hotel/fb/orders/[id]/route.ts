import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addOrderItem,
  closeFbOrder,
  loadOrderById,
  loadOrders,
  sendOrderToKitchen,
  setOrderRush,
  voidFbOrder,
} from "@/lib/hms/fb-orders";
import { fbForbidden, requireFbApi } from "../../_lib";

const PatchSchema = z.object({
  slug: z.string().min(1),
  action: z.enum(["send_to_kitchen", "rush", "close", "void", "add_item"]),
  rush: z.boolean().optional(),
  menuItemId: z.string().uuid().optional(),
  voidReason: z.string().max(200).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.action === "void") {
      const denied = fbForbidden(auth.capabilities, "canVoidOrder");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
      const result = await voidFbOrder(auth.service, auth.tenant.id, id, body.voidReason);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, order: result.order });
    }

    if (body.action === "close") {
      const denied = fbForbidden(auth.capabilities, "canCloseOrder");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
      const result = await closeFbOrder(auth.service, auth.tenant.id, id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, order: result.order });
    }

    const denied = fbForbidden(auth.capabilities, "canUsePos");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    if (body.action === "send_to_kitchen") {
      const result = await sendOrderToKitchen(auth.service, auth.tenant.id, id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      const order =
        result.order ?? (await loadOrderById(auth.service, auth.tenant.id, id));
      return NextResponse.json({ ok: true, order });
    }

    if (body.action === "rush") {
      const result = await setOrderRush(auth.service, auth.tenant.id, id, Boolean(body.rush));
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, order: result.order });
    }

    if (body.action === "add_item" && body.menuItemId) {
      const result = await addOrderItem(auth.service, {
        tenantId: auth.tenant.id,
        orderId: id,
        menuItemId: body.menuItemId,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      const order = await loadOrderById(auth.service, auth.tenant.id, id);
      return NextResponse.json({ ok: true, order, item: result.item });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
