import { createServerSupabaseClient } from "@/lib/supabase/server";
import { guestHasVipTag } from "@/lib/hms/front-desk-board";

function displayName(g: { title?: string | null; first_name: string; last_name: string }) {
  const title = g.title?.trim();
  const name = `${g.first_name} ${g.last_name}`.trim();
  return title ? `${title} ${name}` : name;
}

const OPEN_REQUEST_STATUSES = new Set(["pending", "assigned", "in_progress", "waiting", "escalated"]);

export type GuestDirectoryRow = {
  id: string;
  displayName: string;
  phone: string;
  email: string;
  tags: string[];
  isVip: boolean;
  visitCount: number;
  openRequestCount: number;
  lastStayAt: string | null;
};

export type GuestDirectorySummary = {
  totalGuests: number;
  vipGuests: number;
  withOpenRequests: number;
  repeatGuests: number;
};

export type GuestDirectoryPayload = {
  rows: GuestDirectoryRow[];
  summary: GuestDirectorySummary;
};

/** Single batched pass (guests -> their reservations -> their requests) instead of one
 * round-trip per guest, so this scales past a handful of directory rows. */
export async function getGuestsDirectory(tenantId: string): Promise<GuestDirectoryPayload> {
  const supabase = createServerSupabaseClient();
  const { data: guests } = await supabase
    .schema("hotel")
    .from("guests")
    .select("id,title,first_name,last_name,phone,email,tags,created_at")
    .eq("tenant_id", tenantId)
    .order("last_name");

  const guestRows = guests ?? [];
  if (guestRows.length === 0) {
    return { rows: [], summary: { totalGuests: 0, vipGuests: 0, withOpenRequests: 0, repeatGuests: 0 } };
  }

  const guestIds = guestRows.map((g) => g.id as string);

  const { data: links } = await supabase
    .schema("hotel")
    .from("reservation_guests")
    .select("guest_id,reservation_id")
    .in("guest_id", guestIds);

  const reservationIdsByGuest = new Map<string, string[]>();
  const guestIdsByReservation = new Map<string, string[]>();
  for (const l of links ?? []) {
    const guestId = l.guest_id as string;
    const resId = l.reservation_id as string;
    const list = reservationIdsByGuest.get(guestId) ?? [];
    list.push(resId);
    reservationIdsByGuest.set(guestId, list);
    const gList = guestIdsByReservation.get(resId) ?? [];
    gList.push(guestId);
    guestIdsByReservation.set(resId, gList);
  }

  const allReservationIds = [...guestIdsByReservation.keys()];

  const [{ data: reservations }, { data: requests }] = await Promise.all([
    allReservationIds.length > 0
      ? supabase
          .schema("hotel")
          .from("reservations")
          .select("id,departure_at,status,vip_flag")
          .in("id", allReservationIds)
      : Promise.resolve({ data: [] as { id: string; departure_at: string; status: string; vip_flag: boolean }[] }),
    allReservationIds.length > 0
      ? supabase.schema("hotel").from("guest_requests").select("reservation_id,status").in("reservation_id", allReservationIds)
      : Promise.resolve({ data: [] as { reservation_id: string; status: string }[] }),
  ]);

  const reservationById = new Map(
    (reservations ?? []).map((r) => [r.id as string, r as { departure_at: string; status: string; vip_flag: boolean }]),
  );

  const openRequestCountByReservation = new Map<string, number>();
  for (const r of (requests ?? []) as { reservation_id: string; status: string }[]) {
    if (!OPEN_REQUEST_STATUSES.has(r.status)) continue;
    openRequestCountByReservation.set(r.reservation_id, (openRequestCountByReservation.get(r.reservation_id) ?? 0) + 1);
  }

  const rows: GuestDirectoryRow[] = guestRows.map((g) => {
    const tags = Array.isArray(g.tags) ? g.tags.filter((t): t is string => typeof t === "string") : [];
    const resIds = reservationIdsByGuest.get(g.id as string) ?? [];
    const stays = resIds.map((id) => reservationById.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));

    const visitCount = stays.filter((s) => s.status === "checked_in" || s.status === "checked_out").length;
    const isVip = guestHasVipTag({ tags }) || stays.some((s) => s.vip_flag);
    const openRequestCount = resIds.reduce((sum, id) => sum + (openRequestCountByReservation.get(id) ?? 0), 0);
    const lastStayAt = stays.reduce<string | null>((latest, s) => {
      if (!s.departure_at) return latest;
      if (!latest || new Date(s.departure_at).getTime() > new Date(latest).getTime()) return s.departure_at;
      return latest;
    }, null);

    return {
      id: g.id as string,
      displayName: displayName(g),
      phone: g.phone as string,
      email: g.email as string,
      tags,
      isVip,
      visitCount,
      openRequestCount,
      lastStayAt,
    };
  });

  const summary: GuestDirectorySummary = {
    totalGuests: rows.length,
    vipGuests: rows.filter((r) => r.isVip).length,
    withOpenRequests: rows.filter((r) => r.openRequestCount > 0).length,
    repeatGuests: rows.filter((r) => r.visitCount > 1).length,
  };

  return { rows, summary };
}
