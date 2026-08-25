import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getFolioForReservation } from "@/lib/hms/folio";

const Query = z.object({ slug: z.string().min(1), reservationId: z.string().uuid() });

/** Reads the reservation's existing folio (owned by Front Desk) to pre-fill an invoice
 * amount from the "company" leg of the folio split — the part already earmarked for
 * city-ledger billing rather than the guest's own card/cash. Read-only: this never
 * writes to the folio, so it can't disturb the live checkout flow. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = Query.parse({
      slug: url.searchParams.get("slug"),
      reservationId: url.searchParams.get("reservationId"),
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const folio = await getFolioForReservation(auth.service, auth.tenant.id, query.reservationId);
    return NextResponse.json({ companyLegBalance: folio.companyLegBalance, balance: folio.balance });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[customer-invoices folio-balance GET]", e);
    return NextResponse.json({ error: "Failed to load folio balance." }, { status: 500 });
  }
}
