import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";

const QuerySchema = z.object({
  slug: z.string().min(1),
});

type ReservationRow = {
  id: string;
  confirmation_code: string;
  folio_number: string;
  status: string;
  room_unit_id: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  reservation_guests: {
    is_primary: boolean;
    guests:
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null;
  }[] | null;
};

const SELECT =
  "id,confirmation_code,folio_number,status,room_unit_id,checked_in_at,checked_out_at,reservation_guests(is_primary,guests(first_name,last_name))";

function guestNameFor(r: ReservationRow) {
  const primary = r.reservation_guests?.find((e) => e.is_primary) ?? r.reservation_guests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const [{ data: inHouseRows }, { data: checkedOutRows }] = await Promise.all([
      auth.service
        .schema("hotel")
        .from("reservations")
        .select(SELECT)
        .eq("tenant_id", auth.tenant.id)
        .eq("status", "checked_in")
        .order("checked_in_at", { ascending: false })
        .limit(100),
      auth.service
        .schema("hotel")
        .from("reservations")
        .select(SELECT)
        .eq("tenant_id", auth.tenant.id)
        .eq("status", "checked_out")
        .order("checked_out_at", { ascending: false })
        .limit(100),
    ]);

    const inHouse = (inHouseRows ?? []) as ReservationRow[];
    const checkedOut = (checkedOutRows ?? []) as ReservationRow[];
    const allReservations = [...inHouse, ...checkedOut];

    const roomUnitIds = [
      ...new Set(
        allReservations
          .map((r) => r.room_unit_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0),
      ),
    ];
    const { data: roomUnits } = roomUnitIds.length
      ? await auth.service
          .schema("hotel")
          .from("room_units")
          .select("id,room_code")
          .in("id", roomUnitIds)
      : { data: [] as { id: string; room_code: string }[] };
    const roomCodeById = new Map((roomUnits ?? []).map((u) => [u.id as string, u.room_code as string]));

    const allIds = allReservations.map((r) => r.id);
    const { data: lineRows } = allIds.length
      ? await auth.service
          .schema("hotel")
          .from("folio_transactions")
          .select("reservation_id,amount,voided_at")
          .eq("tenant_id", auth.tenant.id)
          .in("reservation_id", allIds)
      : { data: [] as { reservation_id: string; amount: string | number; voided_at: string | null }[] };

    const balanceById = new Map<string, number>();
    for (const line of lineRows ?? []) {
      if (line.voided_at) continue;
      const prev = balanceById.get(line.reservation_id) ?? 0;
      balanceById.set(line.reservation_id, prev + (Number(line.amount) || 0));
    }

    const toRow = (r: ReservationRow) => ({
      reservationId: r.id,
      confirmationCode: r.confirmation_code,
      folioNumber: r.folio_number,
      guestName: guestNameFor(r),
      roomCode: r.room_unit_id ? roomCodeById.get(r.room_unit_id) ?? null : null,
      status: r.status,
      balance: balanceById.get(r.id) ?? 0,
      lastActivityAt: r.checked_out_at ?? r.checked_in_at,
    });

    const inHouseResults = inHouse.map(toRow);
    const unsettledCheckedOut = checkedOut
      .map(toRow)
      .filter((row) => Math.abs(row.balance) > 0.01);

    const results = [...inHouseResults, ...unsettledCheckedOut].sort((a, b) => {
      if (a.status !== b.status) return a.status === "checked_in" ? -1 : 1;
      return Math.abs(b.balance) - Math.abs(a.balance);
    });

    return NextResponse.json({ results });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
