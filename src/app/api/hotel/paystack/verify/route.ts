import { NextResponse } from "next/server";
import { z } from "zod";
import { loadFolioPayload } from "@/app/api/hotel/folio/_lib";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { finalizePaystackPayment } from "@/lib/paystack/finalize";

const BodySchema = z.object({
  slug: z.string().min(1),
  reference: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const intentCheck = await auth.service
      .schema("hotel")
      .from("payment_intents")
      .select("tenant_id, reservation_id")
      .eq("paystack_reference", body.reference)
      .maybeSingle();

    if (!intentCheck.data || intentCheck.data.tenant_id !== auth.tenant.id) {
      return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    }

    let folioNumber: string | null = null;
    const reservationId = intentCheck.data.reservation_id as string | null;
    if (reservationId) {
      const payload = await loadFolioPayload(auth, reservationId);
      folioNumber = (payload?.reservation.folio_number as string | null) ?? null;
    }

    const result = await finalizePaystackPayment({
      supabase: auth.service,
      tenant: auth.tenant,
      reference: body.reference,
      actorUserId: auth.user.id,
      folioNumber,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let folio = null;
    if (reservationId) {
      const payload = await loadFolioPayload(auth, reservationId);
      folio = payload?.folio ?? null;
    }

    return NextResponse.json({
      ok: true,
      alreadyFinalized: result.alreadyFinalized,
      intent: result.intent,
      folioLineId: result.folioLineId,
      folio,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
