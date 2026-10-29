import { NextResponse } from "next/server";
import { z } from "zod";
import { chargeFbOrderToRoom, settleFbOrderAtOutlet } from "@/lib/hms/fb-orders";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../../../_lib";

const FolioSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

const PaymentSchema = z.object({
  slug: z.string().min(1),
  method: z.enum(["cash", "card", "pos"]),
  /** Amount to put towards the bill now. Leave out to pay everything that is left. */
  amount: z.coerce.number().positive().optional(),
  /** Amount received. Leave out for an exact payment; cash may be more than the amount. */
  amountTendered: z.coerce.number().positive().optional(),
  /** e.g. "Share 2 of 3" for an even split. */
  shareLabel: z.string().trim().max(40).optional(),
  reservationId: z.string().uuid().optional(),
  /** Tip on top of the amount (cash, card and terminal only). */
  tip: z.coerce.number().min(0, "A tip can't be negative.").max(10_000_000).optional(),
  /** Who the tip is for; null or left out = the shared pool. */
  tipStaffId: z.string().uuid().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    const body =
      action === "payment"
        ? PaymentSchema.parse(await req.json())
        : FolioSchema.parse(await req.json());

    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (action === "folio-charge") {
      const denied = fbForbidden(auth.capabilities, "canPostFolio");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

      const folioBody = body as z.infer<typeof FolioSchema>;
      const charged = await chargeFbOrderToRoom(auth.service, {
        tenantId: auth.tenant.id,
        orderId: id,
        reservationId: folioBody.reservationId,
        postedBy: auth.user.id,
      });
      if (charged.error) return NextResponse.json({ error: charged.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_order_charged_to_room",
        entityType: "fb_order",
        entityId: id,
        after: {
          order_number: charged.order?.order_number,
          amount: charged.order?.subtotal,
          reservation_id: folioBody.reservationId,
        },
      });
      return NextResponse.json({ ok: true, line: charged.line, order: charged.order });
    }

    if (action === "payment") {
      const denied = fbForbidden(auth.capabilities, "canTakePayment");
      if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

      const payBody = body as z.infer<typeof PaymentSchema>;
      const paid = await settleFbOrderAtOutlet(auth.service, {
        tenantId: auth.tenant.id,
        orderId: id,
        method: payBody.method,
        amount: payBody.amount,
        tendered: payBody.amountTendered,
        shareLabel: payBody.shareLabel,
        reservationId: payBody.reservationId,
        tip: payBody.tip,
        tipStaffId: payBody.tipStaffId,
        settledBy: auth.user.id,
      });
      if (paid.error) return NextResponse.json({ error: paid.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_order_paid",
        entityType: "fb_order",
        entityId: id,
        after: {
          order_number: paid.order?.order_number,
          method: payBody.method,
          amount: payBody.amount ?? "rest of bill",
          share: payBody.shareLabel ?? null,
          amount_tendered: payBody.amountTendered ?? null,
          change_given: paid.changeGiven,
          tip: paid.tip,
          tip_for: paid.tip ? (payBody.tipStaffId ?? "pool") : null,
          left_to_pay: paid.remaining,
        },
      });
      return NextResponse.json({
        ok: true,
        order: paid.order,
        changeGiven: paid.changeGiven,
        tip: paid.tip,
        remaining: paid.remaining,
        settled: paid.settled,
      });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 404 });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
