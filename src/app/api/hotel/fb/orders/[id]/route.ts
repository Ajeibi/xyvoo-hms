import { NextResponse } from "next/server";
import { z } from "zod";
import {
  addOrderItem,
  closeFbOrder,
  fireOrderCourse,
  loadOrderById,
  loadOrders,
  markFbOrderServed,
  mergeFbOrders,
  moveOrderToTable,
  waiveServiceCharge,
  sendOrderToKitchen,
  setOrderRush,
  splitFbOrder,
  voidFbOrder,
} from "@/lib/hms/fb-orders";
import { courseLabel, FB_COURSE_MAX } from "@/lib/hms/fb-course-rules";
import { FB_ITEM_NOTE_MAX } from "@/lib/hms/fb-modifier-rules";
import { FB_MAX_BILLS } from "@/lib/hms/fb-split-rules";
import { cancelNeeds, checkReason } from "@/lib/hms/fb-void-rules";
import { verifyManagerPin } from "@/lib/hms/folio";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../../_lib";

const COURSE_ERROR = "Choose a course: straight away, starters, mains or desserts.";

const PatchSchema = z.object({
  slug: z.string().min(1),
  action: z.enum(["send_to_kitchen", "serve", "rush", "close", "void", "add_item", "fire", "split", "merge", "move_table", "waive_service"]),
  rush: z.boolean().optional(),
  fireMode: z.enum(["first_course", "all", "hold"]).optional(),
  /** For "fire": one course number, or "all" held courses. Also the course for "add_item". */
  course: z
    .union(
      [
        z.literal("all"),
        z.coerce.number().int().min(0, COURSE_ERROR).max(FB_COURSE_MAX, COURSE_ERROR),
      ],
      { error: COURSE_ERROR },
    )
    .optional(),
  menuItemId: z.string().uuid().optional(),
  modifierOptionIds: z.array(z.string().uuid()).max(40).optional(),
  itemNotes: z
    .string()
    .max(FB_ITEM_NOTE_MAX, `Keep kitchen notes to ${FB_ITEM_NOTE_MAX} characters.`)
    .optional()
    .nullable(),
  voidReason: z.string().max(200).optional(),
  /** Not needed when the person is a manager or owner. */
  managerPin: z.string().max(20).optional(),
  /** For "waive_service". */
  reason: z.string().max(200).optional(),
  /** For "move_table". */
  tableId: z.string().uuid().optional(),
  /** For "split": which bill (1, 2, 3…) each line goes on. */
  billOf: z
    .record(
      z.string().uuid(),
      z.coerce
        .number()
        .int()
        .min(1, `Choose a bill from 1 to ${FB_MAX_BILLS} for every item.`)
        .max(FB_MAX_BILLS, `Choose a bill from 1 to ${FB_MAX_BILLS} for every item.`),
    )
    .optional(),
  /** For "merge": the bill this one is combined into. */
  intoOrderId: z.string().uuid().optional(),
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
      // Once the kitchen has started, cancelling is waste: it needs a reason and a manager.
      const current = await loadOrderById(auth.service, auth.tenant.id, id);
      if (!current) return NextResponse.json({ error: "Order not found." }, { status: 404 });
      const needs = cancelNeeds(current.items);
      const reason = checkReason(body.voidReason, needs.needsReason);
      if (reason.error) return NextResponse.json({ error: reason.error }, { status: 400 });
      if (needs.needsManager && !(await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role))) {
        return NextResponse.json(
          { error: body.managerPin ? "That manager PIN isn't right." : "A manager needs to approve this. Enter the manager PIN." },
          { status: 403 },
        );
      }
      const result = await voidFbOrder(auth.service, auth.tenant.id, id, reason.reason ?? undefined, auth.user.id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_order_cancelled",
        entityType: "fb_order",
        entityId: id,
        before: { order_number: current.order_number, subtotal: current.subtotal },
        after: { reason: reason.reason, manager_approved: needs.needsManager },
      });
      return NextResponse.json({ ok: true, order: result.order });
    }

    if (body.action === "close") {
      const denied = fbForbidden(auth.capabilities, "canCloseOrder");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });
      // Payment goes through POST /orders/[id]/payment; this only closes a settled order.
      const result = await closeFbOrder(auth.service, auth.tenant.id, id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, order: result.order });
    }

    const denied = fbForbidden(auth.capabilities, "canUsePos");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    if (body.action === "send_to_kitchen") {
      const result = await sendOrderToKitchen(auth.service, auth.tenant.id, id, body.fireMode);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      const order =
        result.order ?? (await loadOrderById(auth.service, auth.tenant.id, id));
      return NextResponse.json({ ok: true, order });
    }

    if (body.action === "waive_service") {
      const reason = checkReason(body.reason, true);
      if (reason.error) return NextResponse.json({ error: reason.error }, { status: 400 });
      if (!(await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role))) {
        return NextResponse.json(
          { error: body.managerPin ? "That manager PIN isn't right." : "A manager needs to approve this. Enter the manager PIN." },
          { status: 403 },
        );
      }
      const before = await loadOrderById(auth.service, auth.tenant.id, id);
      const result = await waiveServiceCharge(auth.service, auth.tenant.id, id, reason.reason as string);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_service_charge_waived",
        entityType: "fb_order",
        entityId: id,
        before: { service_charge: before?.service_charge_amount, total: before?.subtotal },
        after: { reason: reason.reason, total: result.order?.subtotal },
      });
      return NextResponse.json({ ok: true, order: result.order });
    }

    if (body.action === "move_table") {
      if (!body.tableId) return NextResponse.json({ error: "Choose a table." }, { status: 400 });
      const result = await moveOrderToTable(auth.service, auth.tenant.id, id, body.tableId);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_bill_moved_table",
        entityType: "fb_order",
        entityId: id,
        after: { order_number: result.order?.order_number, table: result.order?.table_code, bills: result.moved },
      });
      return NextResponse.json({ ok: true, order: result.order });
    }

    if (body.action === "split") {
      if (!body.billOf) return NextResponse.json({ error: "Choose a bill for each item." }, { status: 400 });
      const result = await splitFbOrder(auth.service, auth.tenant.id, id, body.billOf);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_bill_split",
        entityType: "fb_order",
        entityId: id,
        after: { bills: result.orders.map((o) => ({ order_number: o.order_number, subtotal: o.subtotal })) },
      });
      return NextResponse.json({ ok: true, orders: result.orders });
    }

    if (body.action === "merge") {
      if (!body.intoOrderId) return NextResponse.json({ error: "Choose the bill to combine with." }, { status: 400 });
      const result = await mergeFbOrders(auth.service, auth.tenant.id, body.intoOrderId, id);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_bills_combined",
        entityType: "fb_order",
        entityId: id,
        after: { into: result.order?.order_number, subtotal: result.order?.subtotal },
      });
      return NextResponse.json({ ok: true, order: result.order });
    }

    if (body.action === "fire") {
      if (body.course === undefined) {
        return NextResponse.json({ error: "Choose which course to fire." }, { status: 400 });
      }
      const result = await fireOrderCourse(auth.service, auth.tenant.id, id, body.course);
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_course_fired",
        entityType: "fb_order",
        entityId: id,
        after: {
          order_number: result.order?.order_number,
          course: body.course === "all" ? "all" : courseLabel(body.course),
          items: result.fired,
        },
      });
      return NextResponse.json({ ok: true, order: result.order, fired: result.fired });
    }

    if (body.action === "serve") {
      const deniedServe = fbForbidden(auth.capabilities, "canCloseOrder");
      if (deniedServe) return NextResponse.json({ error: deniedServe.error }, { status: deniedServe.status });
      const result = await markFbOrderServed(auth.service, auth.tenant.id, id, auth.user.id);
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
        modifierOptionIds: body.modifierOptionIds,
        notes: body.itemNotes,
        course: typeof body.course === "number" ? body.course : null,
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
