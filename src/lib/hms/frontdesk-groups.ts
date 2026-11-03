import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFolioBalance, mapFolioLineRow } from "@/lib/hms/folio";

/*
 * Groups: several rooms booked together (a wedding party, a team, a tour) so the desk can check
 * them in in one go and see one master bill made of every room's own bill. A group is a
 * `hotel.group_bookings` row; each member booking points at it with `group_booking_id`.
 */

export * from "@/lib/hms/frontdesk-groups-shared";
import { GROUPABLE_STATUSES, roundMoney, summariseGroup, type GroupCandidate, type GroupMember, type GroupSummary } from "@/lib/hms/frontdesk-groups-shared";

type ResRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  room_unit_id: string | null;
  group_booking_id?: string | null;
  reservation_guests?: { is_primary: boolean | null; guests: unknown }[] | null;
};

const RES_COLUMNS =
  "id,confirmation_code,status,arrival_at,departure_at,room_unit_id,group_booking_id,reservation_guests(is_primary,guests(first_name,last_name,title))";

function guestNameOf(r: ResRow) {
  const links = r.reservation_guests ?? [];
  const link = links.find((l) => l.is_primary) ?? links[0];
  const raw = link?.guests as unknown;
  const g = (Array.isArray(raw) ? raw[0] : raw) as { first_name?: string; last_name?: string; title?: string } | null | undefined;
  const name = [g?.title, g?.first_name, g?.last_name].filter(Boolean).join(" ").trim();
  return name || "Guest";
}

async function roomCodes(db: SupabaseClient, tenantId: string, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data } = await db.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", tenantId).in("id", unique);
  for (const u of data ?? []) map.set(u.id as string, u.room_code as string);
  return map;
}

/** Every group of the hotel that still has a booking coming or in the house, with each room's bill. */
export async function loadGroups(db: SupabaseClient, tenantId: string, groupId?: string): Promise<GroupSummary[]> {
  let q = db
    .schema("hotel")
    .from("group_bookings")
    .select("id,group_name,coordinator_name,coordinator_phone,shared_billing,notes,created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (groupId) q = q.eq("id", groupId);
  const { data: groups, error } = await q;
  if (error || !groups?.length) return [];

  const { data: resRows } = await db
    .schema("hotel")
    .from("reservations")
    .select(RES_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("group_booking_id", groups.map((g) => g.id as string));
  const reservations = (resRows ?? []) as unknown as ResRow[];

  const ids = reservations.map((r) => r.id);
  const { data: lineRows } = ids.length
    ? await db.schema("hotel").from("folio_transactions").select("*").eq("tenant_id", tenantId).in("reservation_id", ids)
    : { data: [] };
  const linesByRes = new Map<string, ReturnType<typeof mapFolioLineRow>[]>();
  for (const row of lineRows ?? []) {
    const line = mapFolioLineRow(row as Record<string, unknown>);
    const list = linesByRes.get(line.reservation_id) ?? [];
    list.push(line);
    linesByRes.set(line.reservation_id, list);
  }
  const codes = await roomCodes(db, tenantId, reservations.map((r) => r.room_unit_id));

  const out: GroupSummary[] = [];
  for (const g of groups) {
    const members: GroupMember[] = reservations
      .filter((r) => r.group_booking_id === g.id)
      .map((r) => {
        const bal = computeFolioBalance(linesByRes.get(r.id) ?? []);
        return {
          reservationId: r.id,
          confirmationCode: r.confirmation_code,
          guestName: guestNameOf(r),
          status: r.status,
          roomUnitId: r.room_unit_id,
          roomCode: r.room_unit_id ? (codes.get(r.room_unit_id) ?? null) : null,
          arrivalAt: r.arrival_at,
          departureAt: r.departure_at,
          charges: roundMoney(bal.charges),
          paid: roundMoney(bal.credits),
          balance: roundMoney(bal.balance),
        };
      })
      .sort((a, b) => (a.roomCode ?? "~").localeCompare(b.roomCode ?? "~", undefined, { numeric: true }));
    const arrivals = members.map((m) => m.arrivalAt).sort();
    const departures = members.map((m) => m.departureAt).sort();
    out.push({
      id: g.id as string,
      name: g.group_name as string,
      coordinatorName: (g.coordinator_name as string | null) ?? null,
      coordinatorPhone: (g.coordinator_phone as string | null) ?? null,
      sharedBilling: Boolean(g.shared_billing),
      notes: (g.notes as string | null) ?? null,
      arrivalAt: arrivals[0] ?? null,
      departureAt: departures[departures.length - 1] ?? null,
      members,
      ...summariseGroup(members),
    });
  }
  return out;
}

/** Bookings that can be put into a group: still to arrive soon, and not in another group. */
export async function loadGroupCandidates(db: SupabaseClient, tenantId: string): Promise<GroupCandidate[]> {
  const from = new Date(Date.now() - 2 * 86400000).toISOString();
  const to = new Date(Date.now() + 45 * 86400000).toISOString();
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select(RES_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "confirmed")
    .is("group_booking_id", null)
    .gte("arrival_at", from)
    .lte("arrival_at", to)
    .order("arrival_at", { ascending: true })
    .limit(150);
  const rows = (data ?? []) as unknown as ResRow[];
  const codes = await roomCodes(db, tenantId, rows.map((r) => r.room_unit_id));
  return rows.map((r) => ({
    reservationId: r.id,
    confirmationCode: r.confirmation_code,
    guestName: guestNameOf(r),
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    roomCode: r.room_unit_id ? (codes.get(r.room_unit_id) ?? null) : null,
  }));
}

export type CreateGroupInput = {
  tenantId: string;
  name: string;
  coordinatorName?: string;
  coordinatorPhone?: string;
  sharedBilling: boolean;
  notes?: string;
  reservationIds: string[];
};

/** Makes the group and puts the bookings in it. Refuses bookings that are gone, in another group or already over. */
export async function createGroup(db: SupabaseClient, input: CreateGroupInput): Promise<{ id: string } | { error: string }> {
  const ids = [...new Set(input.reservationIds)];
  if (ids.length < 2) return { error: "A group needs at least two rooms." };

  const { data: found } = await db
    .schema("hotel")
    .from("reservations")
    .select("id,status,group_booking_id,arrival_at,departure_at")
    .eq("tenant_id", input.tenantId)
    .in("id", ids);
  if ((found?.length ?? 0) !== ids.length) return { error: "One of those bookings could not be found." };
  if (found!.some((r) => !GROUPABLE_STATUSES.includes(r.status as string))) {
    return { error: "Only bookings that are coming or in the house can join a group." };
  }
  if (found!.some((r) => r.group_booking_id)) return { error: "One of those bookings is already in a group." };

  const arrivals = found!.map((r) => r.arrival_at as string).sort();
  const departures = found!.map((r) => r.departure_at as string).sort();
  const { data: group, error } = await db
    .schema("hotel")
    .from("group_bookings")
    .insert({
      tenant_id: input.tenantId,
      group_name: input.name,
      coordinator_name: input.coordinatorName || null,
      coordinator_phone: input.coordinatorPhone || null,
      room_count: ids.length,
      shared_billing: input.sharedBilling,
      notes: input.notes || null,
      arrival_at: arrivals[0],
      departure_at: departures[departures.length - 1],
    })
    .select("id")
    .single();
  if (error || !group) return { error: "Could not create the group." };

  const { error: linkError } = await db
    .schema("hotel")
    .from("reservations")
    .update({ group_booking_id: group.id })
    .eq("tenant_id", input.tenantId)
    .in("id", ids);
  if (linkError) {
    await db.schema("hotel").from("group_bookings").delete().eq("id", group.id);
    return { error: "Could not add the bookings to the group." };
  }
  return { id: group.id as string };
}

/** Takes the listed bookings out of the group. */
export async function removeFromGroup(db: SupabaseClient, tenantId: string, groupId: string, reservationIds: string[]) {
  await db
    .schema("hotel")
    .from("reservations")
    .update({ group_booking_id: null })
    .eq("tenant_id", tenantId)
    .eq("group_booking_id", groupId)
    .in("id", reservationIds);
  await syncRoomCount(db, tenantId, groupId);
}

/** Puts more bookings into the group. Returns how many were added. */
export async function addToGroup(db: SupabaseClient, tenantId: string, groupId: string, reservationIds: string[]) {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .update({ group_booking_id: groupId })
    .eq("tenant_id", tenantId)
    .in("id", reservationIds)
    .in("status", GROUPABLE_STATUSES)
    .is("group_booking_id", null)
    .select("id");
  await syncRoomCount(db, tenantId, groupId);
  return data?.length ?? 0;
}

async function syncRoomCount(db: SupabaseClient, tenantId: string, groupId: string) {
  const { count } = await db
    .schema("hotel")
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("group_booking_id", groupId);
  await db
    .schema("hotel")
    .from("group_bookings")
    .update({ room_count: Math.max(1, count ?? 1) })
    .eq("tenant_id", tenantId)
    .eq("id", groupId);
}

/** Breaks the group up. The bookings stay, just no longer together. */
export async function dissolveGroup(db: SupabaseClient, tenantId: string, groupId: string) {
  await db.schema("hotel").from("reservations").update({ group_booking_id: null }).eq("tenant_id", tenantId).eq("group_booking_id", groupId);
  await db.schema("hotel").from("group_bookings").delete().eq("tenant_id", tenantId).eq("id", groupId);
}
