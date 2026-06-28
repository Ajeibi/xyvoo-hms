import { NextResponse } from "next/server";
import { z } from "zod";
import { loadReservation } from "@/app/api/hotel/folio/_lib";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getFolioForReservation } from "@/lib/hms/folio";
import { paystackInitializeTransaction } from "@/lib/paystack/client";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack/config";
import { buildPaystackReference } from "@/lib/paystack/reference";
import { resolveReservationGuestEmail, tenantCurrency } from "@/lib/paystack/reservation";
import type { PaystackPurpose } from "@/lib/paystack/types";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  email: z.string().email().optional(),
  purpose: z.enum(["folio_charge", "preauth"]).default("folio_charge"),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const config = getPaystackConfig(auth.tenant);
    if (!isPaystackReady(config)) {
      return NextResponse.json(
        { error: "Paystack is not configured. Add keys in Settings." },
        { status: 400 },
      );
    }

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const folio = await getFolioForReservation(auth.service, auth.tenant.id, body.reservationId, {
      settlementMethod: reservation.settlement_method,
      preauthAmount: reservation.preauth_amount != null ? Number(reservation.preauth_amount) : null,
      totalRoomCharges: Number(reservation.total_room_charges),
      status: reservation.status,
    });

    if (body.purpose === "folio_charge" && body.amount > folio.balance + 0.01) {
      return NextResponse.json(
        { error: `Amount exceeds folio balance (${folio.balance.toFixed(2)}).` },
        { status: 400 },
      );
    }

    const currency = tenantCurrency(auth.tenant);
    const email = await resolveReservationGuestEmail(
      auth.service,
      auth.tenant.id,
      body.reservationId,
      body.email,
    );

    const { data: intentRow, error: intentErr } = await auth.service
      .schema("hotel")
      .from("payment_intents")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: body.reservationId,
        amount: body.amount,
        currency_code: currency,
        purpose: body.purpose as PaystackPurpose,
        paystack_reference: "pending",
        status: "pending",
        created_by: auth.user.id,
        metadata: { email },
      })
      .select("id")
      .single();

    if (intentErr || !intentRow) {
      return NextResponse.json({ error: intentErr?.message ?? "Could not create payment intent." }, { status: 500 });
    }

    const reference = buildPaystackReference(auth.tenant.id, intentRow.id as string);
    await auth.service
      .schema("hotel")
      .from("payment_intents")
      .update({ paystack_reference: reference })
      .eq("id", intentRow.id);

    const init = await paystackInitializeTransaction({
      secretKey: config.secretKey!,
      email,
      amount: body.amount,
      currency,
      reference,
      channels: ["card"],
      metadata: {
        tenant_id: auth.tenant.id,
        reservation_id: body.reservationId,
        intent_id: intentRow.id,
        purpose: body.purpose,
      },
    });

    if (!init.ok) {
      await auth.service
        .schema("hotel")
        .from("payment_intents")
        .update({ status: "failed", metadata: { error: init.message } })
        .eq("id", intentRow.id);
      return NextResponse.json({ error: init.message }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      reference: init.result.reference,
      accessCode: init.result.accessCode,
      authorizationUrl: init.result.authorizationUrl,
      publicKey: config.publicKey,
      amount: body.amount,
      currency,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
