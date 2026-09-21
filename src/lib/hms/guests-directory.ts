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
  total: number;
};

const DEFAULT_PAGE_SIZE = 5;

/**
 * Paginated at the guest-table level: only the current page's guests get the expensive
 * reservations/requests join-and-compute pass, instead of every guest in the tenant (the
 * original version loaded and processed the whole table on every request).
 *
 * vipOnly filters on the "vip" tag at the SQL level — the same signal guestHasVipTag() reads,
 * and the only one a guest carries independent of any specific reservation. A guest who is only
 * VIP via a past reservation's vip_flag (set at check-in, not on the guest record) won't match
 * this filter; that's an accepted approximation to keep the query index-able rather than
 * re-introducing a full-table join for a checkbox filter.
 */
export async function getGuestsDirectory(
  tenantId: string,
  opts?: { search?: string; vipOnly?: boolean; page?: number; pageSize?: number },
): Promise<GuestDirectoryPayload> {
  const supabase = createServerSupabaseClient();
  const page = Math.max(1, opts?.page ?? 1);
  const pageSize = opts?.pageSize ?? DEFAULT_PAGE_SIZE;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .schema("hotel")
    .from("guests")
    .select("id,title,first_name,last_name,phone,email,tags,created_at", { count: "exact" })
    .eq("tenant_id", tenantId);

  const q = opts?.search?.trim();
  if (q) {
    const escaped = q.replace(/[%_]/g, "\\$&");
    query = query.or(`first_name.ilike.%${escaped}%,last_name.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`);
  }
  if (opts?.vipOnly) {
    query = query.contains("tags", ["vip"]);
  }

  const { data: guests, count } = await query.order("last_name").range(from, to);
  const total = count ?? 0;

  const summary = await getGuestsDirectorySummary(tenantId);

  const guestRows = guests ?? [];
  if (guestRows.length === 0) {
    return { rows: [], summary, total };
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

  return { rows, summary, total };
}

/**
 * The summary tiles are a tenant-wide aggregate, not scoped to whatever page is currently
 * displayed — this necessarily still scans every guest's reservations/requests once, same cost
 * the original combined function paid on every request regardless of page. Kept as its own
 * lightweight pass (no per-guest display formatting) rather than trying to make an aggregate
 * count "paginated", which isn't a meaningful idea.
 */
export async function getGuestsDirectorySummary(tenantId: string): Promise<GuestDirectorySummary> {
  const supabase = createServerSupabaseClient();
  const { data: guests } = await supabase.schema("hotel").from("guests").select("id,tags").eq("tenant_id", tenantId);
  const guestRows = guests ?? [];
  if (guestRows.length === 0) return { totalGuests: 0, vipGuests: 0, withOpenRequests: 0, repeatGuests: 0 };

  const guestIds = guestRows.map((g) => g.id as string);
  const { data: links } = await supabase
    .schema("hotel")
    .from("reservation_guests")
    .select("guest_id,reservation_id")
    .in("guest_id", guestIds);

  const reservationIdsByGuest = new Map<string, string[]>();
  for (const l of links ?? []) {
    const guestId = l.guest_id as string;
    const list = reservationIdsByGuest.get(guestId) ?? [];
    list.push(l.reservation_id as string);
    reservationIdsByGuest.set(guestId, list);
  }
  const allReservationIds = [...new Set((links ?? []).map((l) => l.reservation_id as string))];

  const [{ data: reservations }, { data: requests }] = await Promise.all([
    allReservationIds.length > 0
      ? supabase.schema("hotel").from("reservations").select("id,status,vip_flag").in("id", allReservationIds)
      : Promise.resolve({ data: [] as { id: string; status: string; vip_flag: boolean }[] }),
    allReservationIds.length > 0
      ? supabase.schema("hotel").from("guest_requests").select("reservation_id,status").in("reservation_id", allReservationIds)
      : Promise.resolve({ data: [] as { reservation_id: string; status: string }[] }),
  ]);

  const reservationById = new Map((reservations ?? []).map((r) => [r.id as string, r as { status: string; vip_flag: boolean }]));
  const openRequestReservationIds = new Set(
    ((requests ?? []) as { reservation_id: string; status: string }[])
      .filter((r) => OPEN_REQUEST_STATUSES.has(r.status))
      .map((r) => r.reservation_id),
  );

  let vipGuests = 0;
  let withOpenRequests = 0;
  let repeatGuests = 0;
  for (const g of guestRows) {
    const tags = Array.isArray(g.tags) ? g.tags.filter((t): t is string => typeof t === "string") : [];
    const resIds = reservationIdsByGuest.get(g.id as string) ?? [];
    const stays = resIds.map((id) => reservationById.get(id)).filter((r): r is NonNullable<typeof r> => Boolean(r));
    if (guestHasVipTag({ tags }) || stays.some((s) => s.vip_flag)) vipGuests++;
    if (resIds.some((id) => openRequestReservationIds.has(id))) withOpenRequests++;
    if (stays.filter((s) => s.status === "checked_in" || s.status === "checked_out").length > 1) repeatGuests++;
  }

  return { totalGuests: guestRows.length, vipGuests, withOpenRequests, repeatGuests };
}
