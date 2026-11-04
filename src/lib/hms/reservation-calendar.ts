import type { SupabaseClient } from "@supabase/supabase-js";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { addDays, dayOf, nightCountsForType } from "@/lib/hms/reservation-availability";
import type { NightCount } from "@/lib/hms/reservation-availability-shared";


/*
 * Everything the booking calendar draws for a window of days: the rooms (grouped by type), a bar
 * for every booking in the window, the blocks, and how many rooms of each type are free each day.
 */

export type CalendarBooking = {
  id: string;
  code: string;
  guestName: string;
  status: "confirmed" | "checked_in" | "checked_out";
  arrivalDay: string;
  departureDay: string;
  nights: number;
  roomUnitId: string | null;
  roomTypeCode: string;
  vip: boolean;
  partySize: number;
  allotmentName: string | null;
  groupName: string | null;
};

export type CalendarRoom = { id: string; code: string; floor: number; status: string };
export type CalendarBlock = { roomUnitId: string; startDay: string; endDay: string | null; reason: string };
export type CalendarGroup = { typeId: string; typeName: string; rooms: CalendarRoom[]; counts: NightCount[] };

export type CalendarPayload = {
  startDay: string;
  days: string[];
  today: string;
  groups: CalendarGroup[];
  bookings: CalendarBooking[];
  blocks: CalendarBlock[];
};

type GuestEmbed = { first_name: string; last_name: string };

export async function loadReservationCalendar(
  db: SupabaseClient,
  params: { tenantId: string; roomTypes: HotelRoomTypeSetup[]; startDay: string; dayCount: number; today: string },
): Promise<CalendarPayload> {
  const days = Array.from({ length: params.dayCount }, (_, i) => addDays(params.startDay, i));
  const endDay = addDays(params.startDay, params.dayCount);

  const [{ data: units }, { data: res }, { data: blockRows }] = await Promise.all([
    db.schema("hotel").from("room_units").select("id,room_code,floor,room_type_code,status").eq("tenant_id", params.tenantId).order("floor").order("room_code"),
    db
      .schema("hotel")
      .from("reservations")
      .select(
        "id,confirmation_code,status,arrival_at,departure_at,nights,adults,children_json,room_unit_id,room_type_code,vip_flag,allotment_id,group_booking_id,reservation_guests(is_primary,guests(first_name,last_name))",
      )
      .eq("tenant_id", params.tenantId)
      .in("status", ["confirmed", "checked_in", "checked_out"])
      .lt("arrival_at", `${endDay}T23:59:59Z`)
      .gt("departure_at", `${addDays(params.startDay, -1)}T00:00:00Z`)
      .order("arrival_at")
      .limit(1500),
    db
      .schema("hotel")
      .from("room_blocks")
      .select("room_unit_id,start_at,end_at,reason,block_type")
      .eq("tenant_id", params.tenantId)
      .eq("active", true)
      .neq("block_type", "soft"),
  ]);

  const allotmentIds = [...new Set((res ?? []).map((r) => r.allotment_id as string | null).filter((x): x is string => Boolean(x)))];
  const groupIds = [...new Set((res ?? []).map((r) => r.group_booking_id as string | null).filter((x): x is string => Boolean(x)))];
  const [{ data: allotments }, { data: groups }] = await Promise.all([
    allotmentIds.length ? db.schema("hotel").from("allotments").select("id,name").in("id", allotmentIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    groupIds.length ? db.schema("hotel").from("group_bookings").select("id,group_name").in("id", groupIds) : Promise.resolve({ data: [] as { id: string; group_name: string }[] }),
  ]);
  const allotmentName = new Map((allotments ?? []).map((a) => [a.id as string, a.name as string]));
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.group_name as string]));

  const bookings: CalendarBooking[] = (res ?? [])
    .map((r) => {
      const links = (r.reservation_guests ?? []) as { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[];
      const primary = links.find((l) => l.is_primary) ?? links[0];
      const g = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
      const arrivalDay = dayOf(r.arrival_at as string);
      const departureDay = dayOf(r.departure_at as string);
      return {
        id: r.id as string,
        code: r.confirmation_code as string,
        guestName: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest",
        status: r.status as CalendarBooking["status"],
        arrivalDay,
        departureDay,
        nights: Number(r.nights) || 1,
        roomUnitId: (r.room_unit_id as string | null) ?? null,
        roomTypeCode: r.room_type_code as string,
        vip: Boolean(r.vip_flag),
        partySize: (Number(r.adults) || 1) + (Array.isArray(r.children_json) ? r.children_json.length : 0),
        allotmentName: r.allotment_id ? (allotmentName.get(r.allotment_id as string) ?? null) : null,
        groupName: r.group_booking_id ? (groupName.get(r.group_booking_id as string) ?? null) : null,
      };
    })
    // Only bookings that really touch the window (the query is a little wider).
    .filter((b) => b.arrivalDay < endDay && b.departureDay >= params.startDay);

  const blocks: CalendarBlock[] = (blockRows ?? [])
    .map((b) => ({ roomUnitId: b.room_unit_id as string, startDay: dayOf(b.start_at as string), endDay: b.end_at ? dayOf(b.end_at as string) : null, reason: (b.reason as string) || "Blocked" }))
    .filter((b) => b.startDay < endDay && (b.endDay === null || b.endDay > params.startDay));

  const counts = await Promise.all(params.roomTypes.map((t) => nightCountsForType(db, { tenantId: params.tenantId, roomTypeCode: t.id, fromDay: params.startDay, toDay: endDay })));

  return {
    startDay: params.startDay,
    days,
    today: params.today,
    groups: params.roomTypes.map((t, i) => ({
      typeId: t.id,
      typeName: t.name,
      rooms: (units ?? [])
        .filter((u) => u.room_type_code === t.id)
        .map((u) => ({ id: u.id as string, code: u.room_code as string, floor: Number(u.floor) || 0, status: String(u.status ?? "") })),
      counts: counts[i],
    })),
    bookings,
    blocks,
  };
}
