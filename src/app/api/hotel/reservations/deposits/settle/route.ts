import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { verifyManagerPin } from "@/lib/hms/folio";
import { DEPOSIT_RESERVATION_COLUMNS, getDepositState, type DepositReservation } from "@/lib/hms/folio-deposits";
import { REFUND_METHODS, settleDeposit } from "@/lib/hms/folio-refunds";

/**
 * POST /api/hotel/reservations/deposits/settle — a held deposit on a booking that won't arrive:
 * refund it (cash or card machine) or keep it as a cancellation fee. Needs a manager's PIN for
 * staff; owners and admins don't.
 */

const BodySchema = z.object({
  slug: z.string().min(1),
  depositId: z.string().uuid(),
  action: z.enum(["refund", "keep"]),
  method: z.enum(REFUND_METHODS).optional(),
  posReference: z.string().max(60).optional(),
  reason: z.string().max(200),
  managerPin: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const allowed = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
    if (!allowed) {
      return NextResponse.json(
        { error: body.managerPin ? "That manager PIN isn't right." : "This needs a manager's PIN.", requiresPin: true },
        { status: 403 },
      );
    }

    const { data: dep } = await auth.service
      .schema("hotel")
      .from("reservation_deposits")
      .select("reservation_id,amount")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", body.depositId)
      .maybeSingle();
    if (!dep) return NextResponse.json({ error: "That deposit wasn't found." }, { status: 404 });

    const result = await settleDeposit(auth.service, {
      tenantId: auth.tenant.id,
      depositId: body.depositId,
      action: body.action,
      method: body.method,
      posReference: body.posReference,
      reason: body.reason,
      userId: auth.user.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.action === "keep" ? "deposit_kept" : "deposit_refunded",
      entityType: "reservation",
      entityId: dep.reservation_id as string,
      after: { depositId: body.depositId, amount: Number(dep.amount), method: body.method ?? null, posReference: body.posReference ?? null, reason: body.reason },
    });

    const { data: booking } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select(DEPOSIT_RESERVATION_COLUMNS)
      .eq("id", dep.reservation_id)
      .maybeSingle();
    return NextResponse.json({ ok: true, deposit: booking ? await getDepositState(auth.service, auth.tenant.id, booking as DepositReservation) : null });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
