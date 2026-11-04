import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { createReservation } from "@/lib/hms/reservation-create";
import type { HotelPricingSetup, HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { addDays, dayOf, formatDayShort, freeOnNight, nightCountsForType } from "@/lib/hms/reservation-availability";

/*
 * Allotments: a number of rooms of one type held for a group between two dates until a release
 * date. Bookings are made against the allotment. From the release date the rooms nobody has
 * been put in go back on sale by themselves (the database counts a lapsed allotment as nothing
 * held); a manager can also release early. Each allotment is tied to a group booking so the front
 * desk's group tools (one bill, group check-in) work on it.
 */

export type AllotmentState = "holding" | "released" | "cancelled" | "ended";

export type AllotmentRow = {
  id: string;
  name: string;
  groupBookingId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  roomTypeCode: string;
  rooms: number;
  startDate: string;
  endDate: string;
  releaseDate: string | null;
  state: AllotmentState;
  notes: string | null;
  pickedUp: number;
  daysToRelease: number | null;
  bookings: { id: string; code: string; guestName: string; status: string; arrivalDay: string; departureDay: string }[];
};

export function allotmentState(a: { status: string; release_date: string | null; end_date: string }, today: string): AllotmentState {
  if (a.status === "cancelled") return "cancelled";
  if (a.status === "released") return "released";
  if (a.end_date <= today) return "ended";
  if (a.release_date && a.release_date <= today) return "released";
  return "holding";
}

type GuestEmbed = { first_name: string; last_name: string };

export async function listAllotments(db: SupabaseClient, tenantId: string, today: string): Promise<AllotmentRow[]> {
  const { data } = await db.schema("hotel").from("allotments").select("*").eq("tenant_id", tenantId).order("start_date", { ascending: true }).limit(200);
  const rows = data ?? [];
  if (!rows.length) return [];
  const { data: res } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,confirmation_code,status,arrival_at,departure_at,allotment_id,reservation_guests(is_primary,guests(first_name,last_name))")
    .eq("tenant_id", tenantId)
    .in("allotment_id", rows.map((r) => r.id as string))
    .in("status", ["confirmed", "checked_in", "checked_out"]);
  return rows.map((a) => {
    const bookings = (res ?? [])
      .filter((r) => r.allotment_id === a.id)
      .map((r) => {
        const links = (r.reservation_guests ?? []) as { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[];
        const p = links.find((l) => l.is_primary) ?? links[0];
        const g = Array.isArray(p?.guests) ? p?.guests[0] : p?.guests;
        return {
          id: r.id as string,
          code: r.confirmation_code as string,
          guestName: g ? `${g.first_name} ${g.last_name}`.trim() : "Guest",
          status: r.status as string,
          arrivalDay: dayOf(r.arrival_at as string),
          departureDay: dayOf(r.departure_at as string),
        };
      });
    const release = (a.release_date as string | null) ?? null;
    return {
      id: a.id as string,
      name: a.name as string,
      groupBookingId: (a.group_booking_id as string | null) ?? null,
      contactName: (a.contact_name as string | null) ?? null,
      contactPhone: (a.contact_phone as string | null) ?? null,
      contactEmail: (a.contact_email as string | null) ?? null,
      roomTypeCode: a.room_type_code as string,
      rooms: a.rooms as number,
      startDate: a.start_date as string,
      endDate: a.end_date as string,
      releaseDate: release,
      state: allotmentState({ status: a.status as string, release_date: release, end_date: a.end_date as string }, today),
      notes: (a.notes as string | null) ?? null,
      pickedUp: bookings.filter((b) => b.status !== "checked_out").length,
      daysToRelease: release ? Math.round((new Date(`${release}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86_400_000) : null,
      bookings,
    };
  });
}

/** Are `rooms` of this type free on every night? Returns a sentence for the first night that falls short. */
async function shortfall(db: SupabaseClient, tenantId: string, typeId: string, rooms: number, start: string, end: string, excludeAllotmentRooms = 0): Promise<string | null> {
  const nights = await nightCountsForType(db, { tenantId, roomTypeCode: typeId, fromDay: start, toDay: end });
  for (const n of nights) {
    const f = freeOnNight(n);
    if (f.freeWithAllowance + excludeAllotmentRooms < rooms) {
      return `Only ${Math.max(0, f.freeWithAllowance + excludeAllotmentRooms)} room${f.freeWithAllowance + excludeAllotmentRooms === 1 ? "" : "s"} of that type can be held on ${formatDayShort(n.night)}.`;
    }
  }
  return null;
}

export type AllotmentInput = {
  name: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  roomTypeCode: string;
  rooms: number;
  startDate: string;
  endDate: string;
  releaseDate?: string | null;
  notes?: string | null;
};

export async function createAllotment(
  db: SupabaseClient,
  params: { tenantId: string; userId: string; roomTypes: HotelRoomTypeSetup[]; today: string; input: AllotmentInput },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const i = params.input;
  if (!i.name.trim()) return { ok: false, error: "Give the allotment a name, such as the group or company." };
  if (!params.roomTypes.some((t) => t.id === i.roomTypeCode)) return { ok: false, error: "Choose a room type." };
  if (!(i.rooms >= 1)) return { ok: false, error: "Hold at least one room." };
  if (i.endDate <= i.startDate) return { ok: false, error: "The last night must come after the first." };
  if (i.startDate < params.today) return { ok: false, error: "An allotment can't start in the past." };
  if (i.releaseDate && i.releaseDate > i.startDate) return { ok: false, error: "The release date must be on or before the first night." };
  const short = await shortfall(db, params.tenantId, i.roomTypeCode, i.rooms, i.startDate, i.endDate);
  if (short) return { ok: false, error: short };

  const { data: group } = await db
    .schema("hotel")
    .from("group_bookings")
    .insert({
      tenant_id: params.tenantId,
      group_name: i.name.trim(),
      coordinator_name: i.contactName?.trim() || null,
      coordinator_phone: i.contactPhone?.trim() || null,
      room_count: i.rooms,
      arrival_at: `${i.startDate}T12:00:00.000Z`,
      departure_at: `${i.endDate}T12:00:00.000Z`,
      notes: i.notes?.trim() || null,
    })
    .select("id")
    .single();

  const { data, error } = await db
    .schema("hotel")
    .from("allotments")
    .insert({
      tenant_id: params.tenantId,
      group_booking_id: group?.id ?? null,
      name: i.name.trim(),
      contact_name: i.contactName?.trim() || null,
      contact_phone: i.contactPhone?.trim() || null,
      contact_email: i.contactEmail?.trim() || null,
      room_type_code: i.roomTypeCode,
      rooms: Math.round(i.rooms),
      start_date: i.startDate,
      end_date: i.endDate,
      release_date: i.releaseDate || null,
      notes: i.notes?.trim() || null,
      created_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !data) {
    if (group?.id) await db.schema("hotel").from("group_bookings").delete().eq("id", group.id);
    return { ok: false, error: "The allotment couldn't be saved." };
  }
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.userId, action: "allotment_created", entityType: "allotment", entityId: data.id as string, after: { ...i } });
  return { ok: true, id: data.id as string };
}

export async function updateAllotment(
  db: SupabaseClient,
  params: { tenantId: string; userId: string; id: string; today: string; change: { action: "release" | "cancel" | "update"; releaseDate?: string | null; rooms?: number } },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: a } = await db.schema("hotel").from("allotments").select("*").eq("tenant_id", params.tenantId).eq("id", params.id).maybeSingle();
  if (!a) return { ok: false, error: "Allotment not found." };
  const c = params.change;
  let update: Record<string, unknown>;
  if (c.action === "release") {
    update = { status: "released", released_at: new Date().toISOString() };
  } else if (c.action === "cancel") {
    update = { status: "cancelled", released_at: new Date().toISOString() };
  } else {
    update = {};
    if (c.releaseDate !== undefined) {
      if (c.releaseDate && c.releaseDate > (a.start_date as string)) return { ok: false, error: "The release date must be on or before the first night." };
      update.release_date = c.releaseDate || null;
    }
    if (c.rooms !== undefined && c.rooms !== a.rooms) {
      if (!(c.rooms >= 1)) return { ok: false, error: "Hold at least one room." };
      if (c.rooms > (a.rooms as number)) {
        const short = await shortfall(db, params.tenantId, a.room_type_code as string, c.rooms, a.start_date as string, a.end_date as string, a.rooms as number);
        if (short) return { ok: false, error: short };
      }
      update.rooms = Math.round(c.rooms);
    }
    if (Object.keys(update).length === 0) return { ok: false, error: "Nothing has changed." };
    // A lapsed allotment that is given a later release date holds its rooms again.
    if (a.status === "released" && update.release_date) update.status = "active";
  }
  const { error } = await db.schema("hotel").from("allotments").update(update).eq("tenant_id", params.tenantId).eq("id", params.id);
  if (error) return { ok: false, error: "The allotment couldn't be changed." };
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.userId,
    action: `allotment_${c.action === "update" ? "changed" : c.action === "release" ? "released" : "cancelled"}`,
    entityType: "allotment",
    entityId: params.id,
    before: { rooms: a.rooms, release_date: a.release_date, status: a.status },
    after: update,
  });
  return { ok: true };
}

/** Parses a pasted rooming list: one guest a line, "First Last, phone, email". */
export function parseRoomingList(text: string) {
  const out: { firstName: string; lastName: string; phone: string; email: string }[] = [];
  const bad: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const [nameRaw, ...rest] = line.split(/[,;\t]/).map((s) => s.trim());
    const parts = (nameRaw ?? "").split(/\s+/).filter(Boolean);
    const email = rest.find((r) => r.includes("@")) ?? "";
    const phone = rest.find((r) => r && !r.includes("@")) ?? "";
    if (parts.length < 2 || (!email && !phone)) {
      bad.push(line);
      continue;
    }
    out.push({ firstName: parts[0], lastName: parts.slice(1).join(" "), phone, email });
  }
  return { guests: out, bad };
}

export async function addRoomingList(
  db: SupabaseClient,
  params: { tenantId: string; userId: string; allotmentId: string; roomTypes: HotelRoomTypeSetup[]; pricing: HotelPricingSetup; today: string; text: string },
): Promise<{ ok: true; made: { code: string; name: string }[]; skipped: string[] } | { ok: false; error: string }> {
  const { data: a } = await db.schema("hotel").from("allotments").select("*").eq("tenant_id", params.tenantId).eq("id", params.allotmentId).maybeSingle();
  if (!a) return { ok: false, error: "Allotment not found." };
  if (a.status !== "active") return { ok: false, error: "This allotment is no longer open." };
  const parsed = parseRoomingList(params.text);
  if (parsed.guests.length === 0) return { ok: false, error: "Add one guest a line, like: Ada Obi, 0803 000 0000, ada@example.com" };

  const { count } = await db.schema("hotel").from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", params.tenantId).eq("allotment_id", params.allotmentId).in("status", ["confirmed", "checked_in"]);
  const room = Math.max(0, (a.rooms as number) - (count ?? 0));
  const made: { code: string; name: string }[] = [];
  const skipped: string[] = parsed.bad.map((b) => `${b} (needs a first and last name, and a phone or email)`);
  for (const g of parsed.guests) {
    if (made.length >= room) {
      skipped.push(`${g.firstName} ${g.lastName} (the allotment is full)`);
      continue;
    }
    const r = await createReservation(db, {
      tenantId: params.tenantId,
      userId: params.userId,
      roomTypes: params.roomTypes,
      pricing: params.pricing,
      today: params.today,
      arrivalDay: a.start_date as string,
      departureDay: a.end_date as string,
      roomTypeCode: a.room_type_code as string,
      adults: 1,
      children: 0,
      newGuest: g,
      source: "referral",
      marketSegment: "group",
      bookingChannel: `Allotment: ${a.name}`,
      allotmentId: params.allotmentId,
      groupBookingId: (a.group_booking_id as string | null) ?? null,
    });
    if (r.ok) made.push({ code: r.confirmationCode, name: `${g.firstName} ${g.lastName}` });
    else skipped.push(`${g.firstName} ${g.lastName} (${r.error})`);
  }
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.userId, action: "allotment_rooming_list", entityType: "allotment", entityId: params.allotmentId, after: { made: made.length, skipped: skipped.length } });
  return { ok: true, made, skipped };
}

export { addDays };
