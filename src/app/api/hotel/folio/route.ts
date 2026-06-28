import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { loadFolioPayload } from "./_lib";

const QuerySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      reservationId: url.searchParams.get("reservationId"),
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const payload = await loadFolioPayload(auth, query.reservationId);
    if (!payload) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    return NextResponse.json({
      reservation: {
        id: payload.reservation.id,
        confirmationCode: payload.reservation.confirmation_code,
        folioNumber: payload.reservation.folio_number,
        status: payload.reservation.status,
        settlementMethod: payload.reservation.settlement_method,
        billToAccount: payload.reservation.bill_to_account,
        poNumber: payload.reservation.po_number,
        folioSplitNotes: payload.reservation.folio_split_notes,
        commissionPlan: payload.reservation.commission_plan,
        commissionValue: payload.reservation.commission_value,
      },
      folio: {
        lines: payload.folio.lines,
        charges: payload.folio.charges,
        credits: payload.folio.credits,
        balance: payload.folio.balance,
        displayStatus: payload.folio.displayStatus,
        guestLegBalance: payload.folio.guestLegBalance,
        companyLegBalance: payload.folio.companyLegBalance,
      },
      settings: payload.settings,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
