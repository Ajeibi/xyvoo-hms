import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addOrderItem,
  createFbOrder,
  loadOrders,
  sendOrderToKitchen,
} from "@/lib/hms/fb-orders";
import type { FbOrderStatus } from "@/lib/hms/fb-types";
import { fbForbidden, requireFbApi } from "../_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
  status: z.string().optional(),
});

const CreateSchema = z.object({
  slug: z.string().min(1),
  outletId: z.string().uuid(),
  tableId: z.string().uuid().optional().nullable(),
  tabLabel: z.string().max(40).optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
  notes: z.string().max(300).optional(),
  menuItemId: z.string().uuid().optional(),
  sendToKitchen: z.boolean().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
    });
    const auth = await requireFbApi(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const statusList = query.status
      ? (query.status.split(",") as FbOrderStatus[])
      : (["open", "sent_to_kitchen", "ready"] as FbOrderStatus[]);

    const orders = await loadOrders(auth.service, auth.tenant.id, { status: statusList });
    return NextResponse.json({ orders, capabilities: auth.capabilities });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const body = CreateSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canUsePos");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const created = await createFbOrder(auth.service, {
      tenantId: auth.tenant.id,
      outletId: body.outletId,
      tableId: body.tableId,
      tabLabel: body.tabLabel,
      reservationId: body.reservationId,
      placedBy: auth.user.id,
      notes: body.notes,
    });
    if (created.error || !created.order) {
      return NextResponse.json({ error: created.error ?? "Could not create order." }, { status: 400 });
    }

    let order = created.order;
    if (body.menuItemId) {
      const added = await addOrderItem(auth.service, {
        tenantId: auth.tenant.id,
        orderId: order.id,
        menuItemId: body.menuItemId,
      });
      if (added.error) {
        return NextResponse.json({ error: added.error }, { status: 400 });
      }
    }

    if (body.sendToKitchen) {
      const sent = await sendOrderToKitchen(auth.service, auth.tenant.id, order.id);
      if (sent.error) return NextResponse.json({ error: sent.error }, { status: 400 });
      order = sent.order ?? order;
    }

    const orders = await loadOrders(auth.service, auth.tenant.id, { status: ["open", "sent_to_kitchen", "ready"] });
    const full = orders.find((o) => o.id === order.id) ?? { ...order, items: [] };
    return NextResponse.json({ ok: true, order: full });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
