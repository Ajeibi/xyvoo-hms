import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFolioPayload, loadReservation } from "@/app/api/hotel/folio/_lib";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getFolioForReservation } from "@/lib/hms/folio";
import { paystackChargeAuthorization } from "@/lib/paystack/client";
import { getPaystackConfig, isPaystackReady } from "@/lib/paystack/config";
import { finalizePaystackPayment, getSuccessfulPreauthIntent } from "@/lib/paystack/finalize";
import { buildPaystackReference } from "@/lib/paystack/reference";
import { resolveReservationGuestEmail, tenantCurrency } from "@/lib/paystack/reservation";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  amount: z.coerce.number().positive(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const config = getPaystackConfig(auth.tenant);
    if (!isPaystackReady(config)) {
      return NextResponse.json({ error: "Paystack is not configured." }, { status: 400 });
    }

    const reservation = await loadReservation(auth, body.reservationId);
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const preauth = await getSuccessfulPreauthIntent(auth.service, auth.tenant.id, body.reservationId);
    if (!preauth?.authorization_code) {
      return NextResponse.json(
        { error: "No card authorization on file. Authorize at check-in first." },
        { status: 400 },
      );
    }

    const folio = await getFolioForReservation(auth.service, auth.tenant.id, body.reservationId);
    if (body.amount > folio.balance + 0.01) {
      return NextResponse.json(
        { error: `Amount exceeds folio balance (${folio.balance.toFixed(2)}).` },
        { status: 400 },
      );
    }

    const currency = tenantCurrency(auth.tenant);
    const email = await resolveReservationGuestEmail(auth.service, auth.tenant.id, body.reservationId);

    const { data: intentRow, error: intentErr } = await auth.service
      .schema("hotel")
      .from("payment_intents")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: body.reservationId,
        amount: body.amount,
        currency_code: currency,
        purpose: "folio_charge",
        paystack_reference: "pending",
        status: "pending",
        created_by: auth.user.id,
        metadata: { email, capture_from_preauth: preauth.id },
      })
      .select("id")
      .single();

    if (intentErr || !intentRow) {
      return NextResponse.json({ error: intentErr?.message ?? "Could not create intent." }, { status: 500 });
    }

    const reference = buildPaystackReference(auth.tenant.id, intentRow.id as string);
    await auth.service
      .schema("hotel")
      .from("payment_intents")
      .update({ paystack_reference: reference })
      .eq("id", intentRow.id);

    const charge = await paystackChargeAuthorization({
      secretKey: config.secretKey!,
      authorizationCode: preauth.authorization_code,
      email,
      amount: body.amount,
      currency,
      reference,
      metadata: {
        tenant_id: auth.tenant.id,
        reservation_id: body.reservationId,
        intent_id: intentRow.id,
      },
    });

    if (!charge.ok) {
      await auth.service
        .schema("hotel")
        .from("payment_intents")
        .update({ status: "failed", paystack_reference: reference, metadata: { error: charge.message } })
        .eq("id", intentRow.id);
      return NextResponse.json({ error: charge.message }, { status: 502 });
    }

    const finalized = await finalizePaystackPayment({
      supabase: auth.service,
      tenant: auth.tenant,
      reference,
      actorUserId: auth.user.id,
      folioNumber: reservation.folio_number as string | null,
    });

    if (!finalized.ok) {
      return NextResponse.json({ error: finalized.error }, { status: 400 });
    }

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, folio: payload?.folio, intent: finalized.intent });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
