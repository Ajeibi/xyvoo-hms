import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyWaitlistMatch } from "@/lib/hms/notification-rules";

export const WAITLIST_STATUSES = ["waiting", "notified", "converted", "expired", "cancelled"] as const;
export type WaitlistStatus = (typeof WAITLIST_STATUSES)[number];

export type WaitlistEntryRow = {
  id: string;
  guestId: string | null;
  guestName: string;
  phone: string | null;
  email: string | null;
  desiredRoomTypeCode: string | null;
  desiredRoomTypeName: string | null;
  desiredArrivalDate: string;
  desiredDepartureDate: string;
  partySize: number;
  status: WaitlistStatus;
  notes: string | null;
  notifiedAt: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WaitlistSummary = {
  total: number;
  waiting: number;
  notified: number;
  converted: number;
};

export type WaitlistListPayload = {
  rows: WaitlistEntryRow[];
  summary: WaitlistSummary;
};

const TRANSITIONS: Record<WaitlistStatus, WaitlistStatus[]> = {
  waiting: ["notified", "expired", "cancelled"],
  notified: ["converted", "waiting", "expired", "cancelled"],
  converted: [],
  expired: ["waiting"],
  cancelled: [],
};

export function canTransitionWaitlistStatus(from: WaitlistStatus, to: WaitlistStatus): boolean {
  if (from === to) return true;
  return (TRANSITIONS[from] ?? []).includes(to);
}

export type WaitlistListFilters = {
  q?: string;
  status?: WaitlistStatus;
  limit?: number;
};

export async function listWaitlistEntries(
  service: SupabaseClient,
  tenantId: string,
  filters: WaitlistListFilters,
  roomTypeNameByCode: Map<string, string>,
): Promise<WaitlistListPayload> {
  const limit = Math.min(filters.limit ?? 200, 400);

  let q = service
    .schema("hotel")
    .from("waitlist_entries")
    .select(
      "id,guest_id,guest_name,phone,email,desired_room_type_code,desired_arrival_date,desired_departure_date,party_size,status,notes,notified_at,created_by,created_at,updated_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (filters.status) q = q.eq("status", filters.status);

  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);

  const creatorIds = [
    ...new Set((rows ?? []).map((r) => r.created_by as string | null).filter((x): x is string => Boolean(x))),
  ];
  const creatorNameByUserId = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: profiles } = await service
      .from("profiles")
      .select("user_id,contact_name")
      .in("user_id", creatorIds);
    for (const p of profiles ?? []) {
      creatorNameByUserId.set(p.user_id as string, (p.contact_name as string)?.trim() || "Staff");
    }
  }

  let mapped: WaitlistEntryRow[] = (rows ?? []).map((r) => {
    const createdBy = r.created_by as string | null;
    const roomTypeCode = (r.desired_room_type_code as string | null) ?? null;
    return {
      id: r.id as string,
      guestId: (r.guest_id as string | null) ?? null,
      guestName: r.guest_name as string,
      phone: (r.phone as string | null) ?? null,
      email: (r.email as string | null) ?? null,
      desiredRoomTypeCode: roomTypeCode,
      desiredRoomTypeName: roomTypeCode ? (roomTypeNameByCode.get(roomTypeCode) ?? roomTypeCode) : null,
      desiredArrivalDate: r.desired_arrival_date as string,
      desiredDepartureDate: r.desired_departure_date as string,
      partySize: r.party_size as number,
      status: r.status as WaitlistStatus,
      notes: (r.notes as string | null) ?? null,
      notifiedAt: (r.notified_at as string | null) ?? null,
      createdByName: createdBy ? (creatorNameByUserId.get(createdBy) ?? null) : null,
      createdAt: r.created_at as string,
      updatedAt: (r.updated_at as string) ?? (r.created_at as string),
    };
  });

  const qq = (filters.q ?? "").trim().toLowerCase();
  if (qq) {
    mapped = mapped.filter(
      (row) =>
        row.guestName.toLowerCase().includes(qq) ||
        (row.phone?.toLowerCase().includes(qq) ?? false) ||
        (row.email?.toLowerCase().includes(qq) ?? false) ||
        (row.desiredRoomTypeName?.toLowerCase().includes(qq) ?? false),
    );
  }

  const summary: WaitlistSummary = {
    total: mapped.length,
    waiting: mapped.filter((r) => r.status === "waiting").length,
    notified: mapped.filter((r) => r.status === "notified").length,
    converted: mapped.filter((r) => r.status === "converted").length,
  };

  return { rows: mapped, summary };
}

/**
 * Called after a cancellation/no-show frees up a room. Matching against openings is
 * deliberately manual per the original migration comment (no auto-booking, no guest
 * auto-messaging — there's no messaging platform to do that with yet); this closes the smaller
 * gap of staff having to remember to go check the waitlist at all. Picks the single
 * earliest-created 'waiting' entry whose room type (or "any") and date range overlap the
 * opening, marks it 'notified', and alerts staff — it does not notify the guest directly.
 */
export async function matchWaitlistForOpening(
  service: SupabaseClient,
  tenantId: string,
  opening: { roomTypeCode: string | null; arrivalAt: string; departureAt: string; roomTypeNameByCode?: Map<string, string> },
): Promise<boolean> {
  const { data: rows } = await service
    .schema("hotel")
    .from("waitlist_entries")
    .select("id,guest_name,desired_room_type_code,desired_arrival_date,desired_departure_date,created_at")
    .eq("tenant_id", tenantId)
    .eq("status", "waiting")
    .order("created_at", { ascending: true });

  if (!rows?.length) return false;

  const openArrival = new Date(opening.arrivalAt).getTime();
  const openDeparture = new Date(opening.departureAt).getTime();

  const match = rows.find((r) => {
    const roomTypeOk = !r.desired_room_type_code || r.desired_room_type_code === opening.roomTypeCode;
    if (!roomTypeOk) return false;
    const desiredArrival = new Date(r.desired_arrival_date as string).getTime();
    const desiredDeparture = new Date(r.desired_departure_date as string).getTime();
    return desiredArrival < openDeparture && desiredDeparture > openArrival;
  });

  if (!match) return false;

  const notifiedAt = new Date().toISOString();
  await service
    .schema("hotel")
    .from("waitlist_entries")
    .update({ status: "notified", notified_at: notifiedAt, updated_at: notifiedAt })
    .eq("id", match.id)
    .eq("tenant_id", tenantId);

  const roomTypeCode = match.desired_room_type_code as string | null;
  await notifyWaitlistMatch({
    tenantId,
    entityId: match.id as string,
    guestName: match.guest_name as string,
    roomTypeName: roomTypeCode ? (opening.roomTypeNameByCode?.get(roomTypeCode) ?? roomTypeCode) : null,
  });

  return true;
}
