import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";

type GuestEmbed = {
  title: string | null;
  first_name: string;
  last_name: string;
};

type ReservationRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  children_json: unknown;
  room_type_code: string;
  room_unit_id: string | null;
  total_room_charges: number;
  source: string;
  vip_flag: boolean;
  created_at: string;
  reservation_guests: { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[] | null;
};

export type ReservationListRow = {
  id: string;
  confirmationCode: string;
  status: "confirmed" | "checked_in" | "checked_out" | "cancelled" | "no_show";
  guestName: string;
  roomCode: string | null;
  roomTypeName: string;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  partySize: number;
  totalRoomCharges: number;
  source: string;
  vipFlag: boolean;
  createdAt: string;
};

export type ReservationsListSummary = {
  total: number;
  confirmed: number;
  checkedIn: number;
  checkedOut: number;
  cancelledOrNoShow: number;
};

export type ReservationStatusFilter = ReservationListRow["status"];

export const RESERVATIONS_PAGE_SIZE = 5;

export type ReservationsListQuery = {
  search: string;
  status: ReservationStatusFilter | null;
  page: number;
};

export type ReservationsListPayload = {
  rows: ReservationListRow[];
  summary: ReservationsListSummary;
  /** Reservations matching the current search and status filter, across all pages. */
  filteredTotal: number;
  page: number;
  pageSize: number;
};

const RESERVATION_STATUSES: ReservationStatusFilter[] = [
  "confirmed",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
];

export function parseReservationsListQuery(params: {
  q?: string | string[];
  status?: string | string[];
  page?: string | string[];
}): ReservationsListQuery {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const status = first(params.status) as ReservationStatusFilter;
  const page = Number.parseInt(first(params.page), 10);
  return {
    search: first(params.q).trim().slice(0, 100),
    status: RESERVATION_STATUSES.includes(status) ? status : null,
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Characters that would break a PostgREST `or=(...)` filter or act as wildcards. */
function sanitiseSearchTerm(term: string) {
  return term.replace(/[,()*%\\"'.:]/g, " ").replace(/\s+/g, " ").trim();
}

/** Caps the id lists folded into the search filter so the request URL stays a sensible size. */
const SEARCH_ID_LIMIT = 200;

function guestDisplayName(g: GuestEmbed) {
  const title = g.title?.trim();
  const name = `${g.first_name} ${g.last_name}`.trim();
  return title ? `${title} ${name}` : name;
}

function primaryGuestName(r: ReservationRow): string {
  const links = r.reservation_guests ?? [];
  const primary = links.find((l) => l.is_primary) ?? links[0];
  const g = primary?.guests;
  const guest = Array.isArray(g) ? (g[0] ?? null) : g;
  return guest ? guestDisplayName(guest) : "Guest not linked";
}

function childCount(childrenJson: unknown): number {
  return Array.isArray(childrenJson) ? childrenJson.length : 0;
}

/** Reservation ids whose primary or linked guest, or assigned room, matches the search. */
async function findSearchMatches(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  term: string,
) {
  let guestQuery = supabase.schema("hotel").from("guests").select("id").eq("tenant_id", tenantId);
  // Every word must appear in the title, first or last name, so "Ada Obi" finds Ada Obi.
  for (const word of term.split(" ")) {
    guestQuery = guestQuery.or(`title.ilike.*${word}*,first_name.ilike.*${word}*,last_name.ilike.*${word}*`);
  }

  const [{ data: guests }, { data: rooms }] = await Promise.all([
    guestQuery.limit(SEARCH_ID_LIMIT),
    supabase
      .schema("hotel")
      .from("room_units")
      .select("id")
      .eq("tenant_id", tenantId)
      .ilike("room_code", `%${term}%`)
      .limit(SEARCH_ID_LIMIT),
  ]);

  const guestIds = (guests ?? []).map((g) => g.id as string);
  let reservationIds: string[] = [];
  if (guestIds.length > 0) {
    const { data: links } = await supabase
      .schema("hotel")
      .from("reservation_guests")
      .select("reservation_id")
      .in("guest_id", guestIds)
      .limit(SEARCH_ID_LIMIT);
    reservationIds = [...new Set((links ?? []).map((l) => l.reservation_id as string))];
  }

  return { reservationIds, roomIds: (rooms ?? []).map((r) => r.id as string) };
}

/** One page of a tenant's reservations, regardless of date — the "Reservations" list page,
 * distinct from the Arrivals workbench which is scoped to a single day's arrival window.
 * Filtering, searching and paging happen in the database so the page stays the same size
 * however many reservations a hotel builds up. */
export async function getReservationsList(
  tenantId: string,
  roomTypes: HotelRoomTypeSetup[],
  query: ReservationsListQuery,
): Promise<ReservationsListPayload> {
  const supabase = createServerSupabaseClient();
  const guestSelect = "title,first_name,last_name";
  const term = sanitiseSearchTerm(query.search);

  const countByStatus = (statuses: ReservationStatusFilter[] | null) => {
    let q = supabase
      .schema("hotel")
      .from("reservations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId);
    if (statuses) q = q.in("status", statuses);
    return q.then(({ count }) => count ?? 0);
  };

  const matchesPromise = term ? findSearchMatches(supabase, tenantId, term) : Promise.resolve(null);

  const fetchPage = async (page: number) => {
    const matches = await matchesPromise;
    let q = supabase
      .schema("hotel")
      .from("reservations")
      .select(
        `id,confirmation_code,status,arrival_at,departure_at,nights,adults,children_json,room_type_code,room_unit_id,total_room_charges,source,vip_flag,created_at,reservation_guests(is_primary,guests(${guestSelect}))`,
        { count: "exact" },
      )
      .eq("tenant_id", tenantId);
    if (query.status) q = q.eq("status", query.status);
    if (term && matches) {
      const clauses = [`confirmation_code.ilike.*${term}*`];
      if (matches.reservationIds.length) clauses.push(`id.in.(${matches.reservationIds.join(",")})`);
      if (matches.roomIds.length) clauses.push(`room_unit_id.in.(${matches.roomIds.join(",")})`);
      q = q.or(clauses.join(","));
    }
    const from = (page - 1) * RESERVATIONS_PAGE_SIZE;
    return q
      .order("arrival_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + RESERVATIONS_PAGE_SIZE - 1);
  };

  const [pageResult, total, confirmed, checkedIn, checkedOut, cancelledOrNoShow] = await Promise.all([
    fetchPage(query.page),
    countByStatus(null),
    countByStatus(["confirmed"]),
    countByStatus(["checked_in"]),
    countByStatus(["checked_out"]),
    countByStatus(["cancelled", "no_show"]),
  ]);

  let { data: reservations, count: filteredTotal } = pageResult;
  let page = query.page;
  const lastPage = Math.max(1, Math.ceil((filteredTotal ?? 0) / RESERVATIONS_PAGE_SIZE));
  // A stale link (or a cancellation that shrank the list) can point past the end; show the last page.
  if (page > lastPage) {
    page = lastPage;
    ({ data: reservations, count: filteredTotal } = await fetchPage(page));
  }

  const pageRows = (reservations ?? []) as unknown as ReservationRow[];
  const roomUnitIds = [...new Set(pageRows.map((r) => r.room_unit_id).filter((id): id is string => Boolean(id)))];
  const { data: roomUnits } = roomUnitIds.length
    ? await supabase.schema("hotel").from("room_units").select("id,room_code").in("id", roomUnitIds)
    : { data: [] as { id: string; room_code: string }[] };

  const roomCodeById = new Map((roomUnits ?? []).map((u) => [u.id as string, u.room_code as string]));
  const typeNameById = new Map(roomTypes.map((t) => [t.id, t.name]));

  const rows: ReservationListRow[] = pageRows.map((r) => ({
    id: r.id,
    confirmationCode: r.confirmation_code,
    status: r.status as ReservationListRow["status"],
    guestName: primaryGuestName(r),
    roomCode: r.room_unit_id ? (roomCodeById.get(r.room_unit_id) ?? null) : null,
    roomTypeName: typeNameById.get(r.room_type_code) ?? r.room_type_code,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    nights: r.nights,
    partySize: r.adults + childCount(r.children_json),
    totalRoomCharges: r.total_room_charges,
    source: r.source,
    vipFlag: r.vip_flag,
    createdAt: r.created_at,
  }));

  return {
    rows,
    summary: { total, confirmed, checkedIn, checkedOut, cancelledOrNoShow },
    filteredTotal: filteredTotal ?? 0,
    page,
    pageSize: RESERVATIONS_PAGE_SIZE,
  };
}
