import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";

const QuerySchema = z.object({
  slug: z.string().min(1),
  q: z.string().min(1).max(80),
  inHouse: z.enum(["0", "1"]).optional(),
});

type ReservationRow = {
  id: string;
  confirmation_code: string;
  folio_number: string;
  status: string;
  room_unit_id: string | null;
  reservation_guests: {
    is_primary: boolean;
    guests:
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null;
  }[] | null;
};

function mapResults(
  reservations: ReservationRow[],
  roomCodeById: Map<string, string>,
) {
  return reservations.map((r) => {
    const primary = r.reservation_guests?.find((e) => e.is_primary) ?? r.reservation_guests?.[0];
    const g = primary?.guests;
    const guest = Array.isArray(g) ? g[0] : g;
    return {
      reservationId: r.id,
      confirmationCode: r.confirmation_code,
      folioNumber: r.folio_number,
      status: r.status,
      roomCode: r.room_unit_id ? roomCodeById.get(r.room_unit_id) ?? null : null,
      guestName: guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest",
    };
  });
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? "",
      inHouse: url.searchParams.get("inHouse") === "1" ? "1" : "0",
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const q = query.q.trim().replace(/%/g, "");
    const pattern = `%${q}%`;
    const nameTerms = q.toLowerCase().split(/\s+/).filter(Boolean);
    const inHouseOnly = query.inHouse === "1";
    const select =
      "id,confirmation_code,folio_number,status,room_unit_id,reservation_guests(is_primary,guests(first_name,last_name))";

    const byId = new Map<string, ReservationRow>();

    const addReservations = (rows: ReservationRow[] | null | undefined) => {
      for (const r of rows ?? []) {
        byId.set(r.id, r);
      }
    };

    const { data: roomMatches } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .eq("tenant_id", auth.tenant.id)
      .ilike("room_code", q);

    const roomCodeById = new Map((roomMatches ?? []).map((u) => [u.id as string, u.room_code as string]));
    const roomUnitIds = [...roomCodeById.keys()];

    if (roomUnitIds.length > 0) {
      let byRoomQuery = auth.service
        .schema("hotel")
        .from("reservations")
        .select(select)
        .eq("tenant_id", auth.tenant.id)
        .in("room_unit_id", roomUnitIds)
        .limit(20);
      if (inHouseOnly) byRoomQuery = byRoomQuery.eq("status", "checked_in");
      const { data: byRoom } = await byRoomQuery;
      addReservations((byRoom ?? []) as ReservationRow[]);
    }

    let textQuery = auth.service
      .schema("hotel")
      .from("reservations")
      .select(select)
      .eq("tenant_id", auth.tenant.id)
      .or(`confirmation_code.ilike.${pattern},folio_number.ilike.${pattern}`)
      .limit(20);
    if (inHouseOnly) textQuery = textQuery.eq("status", "checked_in");
    const { data: byText } = await textQuery;
    addReservations((byText ?? []) as ReservationRow[]);

    const { data: guestMatches } = await auth.service
      .schema("hotel")
      .from("guests")
      .select("id,first_name,last_name")
      .eq("tenant_id", auth.tenant.id)
      .or(`first_name.ilike.${pattern},last_name.ilike.${pattern}`)
      .limit(40);

    const matchingGuestIds = (guestMatches ?? [])
      .filter((g) => {
        const full = `${g.first_name} ${g.last_name}`.toLowerCase();
        if (nameTerms.length <= 1) return true;
        return nameTerms.every((term) => full.includes(term));
      })
      .map((g) => g.id as string);

    if (matchingGuestIds.length > 0) {
      const { data: guestLinks } = await auth.service
        .schema("hotel")
        .from("reservation_guests")
        .select("reservation_id")
        .in("guest_id", matchingGuestIds)
        .limit(40);

      const reservationIds = [
        ...new Set((guestLinks ?? []).map((l) => l.reservation_id as string)),
      ];

      if (reservationIds.length > 0) {
        let byGuestQuery = auth.service
          .schema("hotel")
          .from("reservations")
          .select(select)
          .eq("tenant_id", auth.tenant.id)
          .in("id", reservationIds)
          .limit(20);
        if (inHouseOnly) byGuestQuery = byGuestQuery.eq("status", "checked_in");
        const { data: byGuest } = await byGuestQuery;
        addReservations((byGuest ?? []) as ReservationRow[]);
      }
    }

    const reservations = [...byId.values()];
    const extraRoomIds = reservations
      .map((r) => r.room_unit_id)
      .filter((id): id is string => typeof id === "string" && id.length > 0 && !roomCodeById.has(id));
    if (extraRoomIds.length > 0) {
      const { data: extraUnits } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("id,room_code")
        .in("id", extraRoomIds);
      for (const u of extraUnits ?? []) {
        roomCodeById.set(u.id as string, u.room_code as string);
      }
    }

    return NextResponse.json({ results: mapResults(reservations, roomCodeById) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
