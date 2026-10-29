import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createFbOrder,
  findOrderByClientRef,
  insertResolvedOrderLine,
  loadOrderById,
  loadOrders,
  type ResolvedOrderLine,
  resolveOrderLine,
  sendOrderToKitchen,
} from "@/lib/hms/fb-orders";
import { FB_COURSE_MAX } from "@/lib/hms/fb-course-rules";
import { FB_ITEM_NOTE_MAX } from "@/lib/hms/fb-modifier-rules";
import type { FbOrderStatus } from "@/lib/hms/fb-types";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";
import { loadPricingNow } from "@/lib/hms/fb-pricing";
import { acceptedOrderedAt, FB_OFFLINE_MAX_AGE_HOURS, ticketTooOld } from "@/lib/hms/fb-offline-queue";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
  status: z.string().optional(),
  reservationId: z.string().uuid().optional(),
});

const CreateSchema = z.object({
  slug: z.string().min(1),
  outletId: z.string().uuid(),
  tableId: z.string().uuid().optional().nullable(),
  tabLabel: z.string().max(40).optional().nullable(),
  reservationId: z.string().uuid().optional().nullable(),
  notes: z.string().max(300).optional(),
  menuItemId: z.string().uuid().optional(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(99).default(1),
        modifierOptionIds: z.array(z.string().uuid()).max(40).optional(),
        notes: z
          .string()
          .max(FB_ITEM_NOTE_MAX, `Keep kitchen notes to ${FB_ITEM_NOTE_MAX} characters.`)
          .optional()
          .nullable(),
        course: z.coerce
          .number()
          .int()
          .min(0)
          .max(FB_COURSE_MAX, "Choose a course: straight away, starters, mains or desserts.")
          .optional()
          .nullable(),
        seat: z.coerce.number().int().min(1).max(99, "Seats go from 1 to 99.").optional().nullable(),
      }),
    )
    .max(100)
    .optional(),
  rush: z.boolean().optional(),
  sendToKitchen: z.boolean().optional(),
  /** first_course (default): drinks and the first course now, the rest held. */
  fireMode: z.enum(["first_course", "all", "hold"]).optional(),
  /** The till's own reference: sending the same ticket again returns the first order. */
  clientRef: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Bad ticket reference.").optional(),
  /** When a ticket taken offline was really ordered (ISO). */
  orderedAt: z.string().max(40).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
      reservationId: url.searchParams.get("reservationId") ?? undefined,
    });
    const auth = await requireFbApi(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const statusList = query.status
      ? (query.status.split(",") as FbOrderStatus[])
      : (["open", "sent_to_kitchen", "ready"] as FbOrderStatus[]);

    const orders = await loadOrders(auth.service, auth.tenant.id, {
      status: statusList,
      reservationId: query.reservationId,
    });
    const fbSettings = await getTenantFbSettings(auth.service, auth.tenant.id);
    return NextResponse.json({
      orders,
      capabilities: auth.capabilities,
      kitchenOverdueMinutes: fbSettings.kitchenOverdueMinutes,
    });
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

    // Sent before (the answer was lost on the way back): return that order, never a second one.
    if (body.clientRef) {
      const existingId = await findOrderByClientRef(auth.service, auth.tenant.id, body.clientRef);
      if (existingId) {
        const existing = await loadOrderById(auth.service, auth.tenant.id, existingId);
        return NextResponse.json({ ok: true, duplicate: true, order: existing });
      }
    }
    if (body.orderedAt && ticketTooOld(body.orderedAt)) {
      return NextResponse.json(
        {
          error: `This ticket was taken more than ${FB_OFFLINE_MAX_AGE_HOURS} hours ago, so it can't be sent now. Check with the guest and take it again.`,
        },
        { status: 400 },
      );
    }
    const orderedAt = acceptedOrderedAt(body.orderedAt);
    const takenOffline = Boolean(body.orderedAt && orderedAt && Date.now() - orderedAt.getTime() > 60_000);

    const lines =
      body.items ??
      (body.menuItemId ? [{ menuItemId: body.menuItemId, quantity: 1 }] : []);

    // Check and price every line first, so a bad choice or a sold-out item
    // never leaves a half-made order behind.
    const resolved: { line: ResolvedOrderLine; quantity: number }[] = [];
    // One clock for the whole ticket, so every line gets the same happy-hour decision.
    // A ticket taken offline is priced at the time the guest ordered.
    const pricing = await loadPricingNow(auth.service, auth.tenant.id, orderedAt ?? new Date());
    for (const line of lines) {
      const result = await resolveOrderLine(auth.service, auth.tenant.id, line, pricing);
      if (!result.line) {
        return NextResponse.json({ error: result.error ?? "Menu item unavailable." }, { status: 400 });
      }
      resolved.push({ line: result.line, quantity: line.quantity });
    }

    const created = await createFbOrder(auth.service, {
      tenantId: auth.tenant.id,
      outletId: body.outletId,
      tableId: body.tableId,
      tabLabel: body.tabLabel,
      reservationId: body.reservationId,
      placedBy: auth.user.id,
      notes: body.notes,
      rush: body.rush,
      clientRef: body.clientRef,
      offlineOrderedAt: takenOffline && orderedAt ? orderedAt.toISOString() : null,
    });
    if (created.duplicateOf) {
      const existing = await loadOrderById(auth.service, auth.tenant.id, created.duplicateOf);
      return NextResponse.json({ ok: true, duplicate: true, order: existing });
    }
    if (created.error || !created.order) {
      return NextResponse.json({ error: created.error ?? "Could not create order." }, { status: 400 });
    }

    let order = created.order;

    for (const { line, quantity } of resolved) {
      for (let i = 0; i < quantity; i += 1) {
        const added = await insertResolvedOrderLine(auth.service, auth.tenant.id, order.id, line);
        if (added.error) {
          return NextResponse.json({ error: added.error }, { status: 400 });
        }
      }
    }

    if (body.sendToKitchen) {
      const sent = await sendOrderToKitchen(auth.service, auth.tenant.id, order.id, body.fireMode);
      if (sent.error) return NextResponse.json({ error: sent.error }, { status: 400 });
      order = sent.order ?? order;
    }

    if (takenOffline && orderedAt) {
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_offline_ticket_sent",
        entityType: "fb_order",
        entityId: order.id,
        after: { order_number: order.order_number, ordered_at: orderedAt.toISOString(), client_ref: body.clientRef ?? null },
      });
    }

    const full =
      (await loadOrderById(auth.service, auth.tenant.id, order.id)) ?? { ...order, items: [] };
    return NextResponse.json({ ok: true, order: full });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
