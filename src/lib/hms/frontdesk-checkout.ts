import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CheckoutDueRow = {
  reservationId: string;
  confirmationCode: string;
  folioNumber: string;
  guestName: string;
  roomCode: string | null;
  isVip: boolean;
  departureAt: string;
  isOverdue: boolean;
  balance: number;
};

type ReservationRow = {
  id: string;
  confirmation_code: string;
  folio_number: string;
  departure_at: string;
  room_unit_id: string | null;
  vip_flag: boolean;
  reservation_guests: {
    is_primary: boolean;
    guests:
      | { first_name: string; last_name: string }
      | { first_name: string; last_name: string }[]
      | null;
  }[] | null;
};

function guestNameFor(r: ReservationRow) {
  const primary = r.reservation_guests?.find((e) => e.is_primary) ?? r.reservation_guests?.[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? g[0] : g;
  return guest ? `${guest.first_name} ${guest.last_name}`.trim() : "Guest";
}

/** Every in-house stay whose departure date is today or earlier (overdue), for the Checkout landing page. */
export async function getCheckoutDueList(tenantId: string): Promise<CheckoutDueRow[]> {
  const supabase = createServerSupabaseClient();
  const endOfToday = new Date();
  endOfToday.setUTCHours(23, 59, 59, 999);

  const { data: rows } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,folio_number,departure_at,room_unit_id,vip_flag,reservation_guests(is_primary,guests(first_name,last_name))",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "checked_in")
    .lte("departure_at", endOfToday.toISOString())
    .order("departure_at", { ascending: true })
    .limit(200);

  const reservations = (rows ?? []) as ReservationRow[];
  if (reservations.length === 0) return [];

  const roomUnitIds = [
    ...new Set(
      reservations.map((r) => r.room_unit_id).filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  const { data: roomUnits } = roomUnitIds.length
    ? await supabase.schema("hotel").from("room_units").select("id,room_code").in("id", roomUnitIds)
    : { data: [] as { id: string; room_code: string }[] };
  const roomCodeById = new Map((roomUnits ?? []).map((u) => [u.id as string, u.room_code as string]));

  const reservationIds = reservations.map((r) => r.id);
  const { data: lineRows } = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .select("reservation_id,amount,voided_at")
    .eq("tenant_id", tenantId)
    .in("reservation_id", reservationIds);

  const balanceById = new Map<string, number>();
  for (const line of lineRows ?? []) {
    if (line.voided_at) continue;
    const prev = balanceById.get(line.reservation_id) ?? 0;
    balanceById.set(line.reservation_id, prev + (Number(line.amount) || 0));
  }

  const now = Date.now();
  const results = reservations.map((r) => ({
    reservationId: r.id,
    confirmationCode: r.confirmation_code,
    folioNumber: r.folio_number,
    guestName: guestNameFor(r),
    roomCode: r.room_unit_id ? roomCodeById.get(r.room_unit_id) ?? null : null,
    isVip: r.vip_flag,
    departureAt: r.departure_at,
    isOverdue: new Date(r.departure_at).getTime() < now,
    balance: balanceById.get(r.id) ?? 0,
  }));

  return results.sort((a, b) => {
    if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
    return a.departureAt.localeCompare(b.departureAt);
  });
}
