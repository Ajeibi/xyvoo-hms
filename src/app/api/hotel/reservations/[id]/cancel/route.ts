import { NextResponse } from "next/server";
import { z } from "zod";
import { managerApproved, requireReservationsApi, todayDay } from "@/lib/hms/reservations-api";
import { cancelReservation, previewCancellation } from "@/lib/hms/reservation-cancellation";
import { sendReservationEmail } from "@/lib/hms/reservation-emails";
import { notifyReservationCancelled } from "@/lib/hms/notification-rules";
import { REFUND_METHODS } from "@/lib/hms/folio-refunds";

/**
 * GET  /api/hotel/reservations/:id/cancel?slug= — what cancelling now would cost, and the deposits held.
 * POST — cancel it. Waiving the fee or settling a deposit needs a manager (their PIN, or an admin).
 */

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const auth = await requireReservationsApi(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const result = await previewCancellation(auth.service, { tenantId: auth.tenant.id, reservationId: id, today: todayDay() });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ...result.preview, isManager: auth.isAdmin });
}

const Body = z.object({
  slug: z.string().min(1),
  reason: z.string().trim().min(1, "Say why the booking is being cancelled.").max(300),
  waiveFee: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  depositDecisions: z
    .array(z.object({ depositId: z.string().uuid(), action: z.enum(["keep", "refund"]), method: z.enum(REFUND_METHODS).optional(), posReference: z.string().max(60).optional() }))
    .max(20)
    .optional(),
  managerPin: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = Body.parse(await req.json());
    const auth = await requireReservationsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const needsManager = Boolean(body.waiveFee) || (body.depositDecisions?.length ?? 0) > 0;
    if (needsManager && !(await managerApproved(auth, body.managerPin))) {
      return NextResponse.json(
        { error: body.managerPin ? "That manager PIN isn't right." : "Waiving a fee or settling a deposit needs a manager's PIN.", requiresPin: true },
        { status: 403 },
      );
    }

    const { data: before } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("confirmation_code,reservation_guests(is_primary,guests(first_name,last_name))")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    const result = await cancelReservation(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: id,
      userId: auth.user.id,
      today: todayDay(),
      reason: body.reason,
      waiveFee: body.waiveFee,
      depositDecisions: body.depositDecisions,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    type G = { first_name: string; last_name: string };
    const links = (before?.reservation_guests ?? []) as { is_primary: boolean; guests: G | G[] | null }[];
    const primary = links.find((l) => l.is_primary) ?? links[0];
    const guest = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
    await notifyReservationCancelled({
      tenantId: auth.tenant.id,
      guestName: guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest",
      confirmationCode: (before?.confirmation_code as string) ?? "",
      entityId: id,
    }).catch(() => undefined);

    let email: { status: string; reason?: string } | null = null;
    if (body.sendEmail !== false) {
      const sent = await sendReservationEmail(auth.service, { tenantId: auth.tenant.id, reservationId: id, kind: "cancellation", userId: auth.user.id });
      email = { status: sent.status, reason: sent.reason };
    }
    return NextResponse.json({ ok: true, fee: result.fee, feeStatus: result.feeStatus, depositErrors: result.depositErrors, email });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    console.error("[reservations cancel]", e);
    return NextResponse.json({ error: "Cancellation failed." }, { status: 500 });
  }
}
