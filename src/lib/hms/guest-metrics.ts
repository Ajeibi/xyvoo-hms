import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * What each guest has done with the hotel: stays, nights and what they were actually billed.
 * One place works it out, so the profile, the directory, segments, loyalty and companies all
 * show the same figures. Spend comes from the bill (folio lines), not the room price, and falls
 * back to the room price only for old stays that have no bill lines.
 */

const PAGE = 1000;
const CHUNK = 150;

export type StayInput = {
  id: string;
  status: string;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  roomTypeCode: string;
  totalRoomCharges: number;
  vipFlag: boolean;
  source: string | null;
  /** Everyone on the booking. Spend is credited to the primary guest only. */
  guests: { guestId: string; isPrimary: boolean }[];
};

export type StayBilled = { total: number; rooms: number; foodBeverage: number; other: number };

export type GuestMetrics = {
  guestId: string;
  /** Stays they checked out of. */
  completedStays: number;
  /** Everything they have checked in to, including the one in progress. */
  staysStarted: number;
  upcomingStays: number;
  cancelled: number;
  noShows: number;
  nights: number;
  spend: number;
  roomSpend: number;
  foodBeverageSpend: number;
  otherSpend: number;
  firstStayAt: string | null;
  lastStayAt: string | null;
  favouriteRoomType: string | null;
  hasVipStay: boolean;
};

export function emptyMetrics(guestId: string): GuestMetrics {
  return {
    guestId,
    completedStays: 0,
    staysStarted: 0,
    upcomingStays: 0,
    cancelled: 0,
    noShows: 0,
    nights: 0,
    spend: 0,
    roomSpend: 0,
    foodBeverageSpend: 0,
    otherSpend: 0,
    firstStayAt: null,
    lastStayAt: null,
    favouriteRoomType: null,
    hasVipStay: false,
  };
}

/** Which part of the bill a department's charges belong to. */
export function billPart(department: string | null): "rooms" | "foodBeverage" | "other" {
  const d = (department ?? "").toLowerCase();
  if (d === "rooms" || d === "room") return "rooms";
  if (d === "food_beverage" || d === "bar" || d === "restaurant" || d === "kitchen") return "foodBeverage";
  return "other";
}

/** Adds up a stay's bill lines: charges plus discounts (discounts are negative), skipping voided lines. */
export function sumBilled(lines: { kind: string; amount: number; department: string | null; voided_at: string | null }[]): StayBilled | null {
  const counted = lines.filter((l) => !l.voided_at && (l.kind === "charge" || l.kind === "discount"));
  if (counted.length === 0) return null;
  const out: StayBilled = { total: 0, rooms: 0, foodBeverage: 0, other: 0 };
  for (const l of counted) {
    out.total += l.amount;
    const part = billPart(l.department);
    if (part === "rooms") out.rooms += l.amount;
    else if (part === "foodBeverage") out.foodBeverage += l.amount;
    else out.other += l.amount;
  }
  return out;
}

/** The pure part: stays and bills in, one figure set per guest out. */
export function foldGuestMetrics(stays: StayInput[], billed: Map<string, StayBilled | null>): Map<string, GuestMetrics> {
  const byGuest = new Map<string, GuestMetrics>();
  const roomTypeCount = new Map<string, Map<string, number>>();
  const get = (id: string) => {
    let m = byGuest.get(id);
    if (!m) {
      m = emptyMetrics(id);
      byGuest.set(id, m);
    }
    return m;
  };

  for (const s of stays) {
    for (const link of s.guests) {
      const m = get(link.guestId);
      if (s.status === "cancelled") {
        m.cancelled += 1;
        continue;
      }
      if (s.status === "no_show") {
        m.noShows += 1;
        continue;
      }
      if (s.status === "confirmed") {
        m.upcomingStays += 1;
        continue;
      }
      if (s.status !== "checked_in" && s.status !== "checked_out") continue;

      m.staysStarted += 1;
      if (s.status === "checked_out") m.completedStays += 1;
      m.nights += Math.max(0, s.nights || 0);
      if (s.vipFlag) m.hasVipStay = true;
      if (!m.firstStayAt || new Date(s.arrivalAt) < new Date(m.firstStayAt)) m.firstStayAt = s.arrivalAt;
      if (!m.lastStayAt || new Date(s.departureAt) > new Date(m.lastStayAt)) m.lastStayAt = s.departureAt;

      const counts = roomTypeCount.get(link.guestId) ?? new Map<string, number>();
      counts.set(s.roomTypeCode, (counts.get(s.roomTypeCode) ?? 0) + 1);
      roomTypeCount.set(link.guestId, counts);

      if (link.isPrimary) {
        const b = billed.get(s.id) ?? null;
        if (b) {
          m.spend += b.total;
          m.roomSpend += b.rooms;
          m.foodBeverageSpend += b.foodBeverage;
          m.otherSpend += b.other;
        } else {
          m.spend += s.totalRoomCharges;
          m.roomSpend += s.totalRoomCharges;
        }
      }
    }
  }

  for (const [guestId, counts] of roomTypeCount) {
    let best: string | null = null;
    let bestN = 0;
    for (const [type, n] of counts) {
      if (n > bestN) {
        best = type;
        bestN = n;
      }
    }
    const m = byGuest.get(guestId);
    if (m) m.favouriteRoomType = best;
  }
  return byGuest;
}

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await page(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

const chunks = <T,>(items: T[], size = CHUNK) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

type ReservationRow = {
  id: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number | null;
  room_type_code: string;
  total_room_charges: number | string | null;
  vip_flag: boolean | null;
  source: string | null;
  reservation_guests: { guest_id: string; is_primary: boolean }[] | null;
};

const RES_SELECT = "id,status,arrival_at,departure_at,nights,room_type_code,total_room_charges,vip_flag,source,reservation_guests(guest_id,is_primary)";

function toStayInput(r: ReservationRow): StayInput {
  return {
    id: r.id,
    status: r.status,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    nights: Number(r.nights) || 0,
    roomTypeCode: r.room_type_code,
    totalRoomCharges: Number(r.total_room_charges) || 0,
    vipFlag: Boolean(r.vip_flag),
    source: r.source,
    guests: (r.reservation_guests ?? []).map((g) => ({ guestId: g.guest_id, isPrimary: Boolean(g.is_primary) })),
  };
}

/** Every stay of the given guests, or of the whole hotel when no guests are named. */
export async function loadStays(service: SupabaseClient, tenantId: string, guestIds?: string[]): Promise<StayInput[]> {
  if (!guestIds) {
    const rows = await fetchAll<ReservationRow>((from, to) =>
      service.schema("hotel").from("reservations").select(RES_SELECT).eq("tenant_id", tenantId).order("id").range(from, to),
    );
    return rows.map(toStayInput);
  }
  if (guestIds.length === 0) return [];
  const reservationIds = new Set<string>();
  for (const part of chunks(guestIds)) {
    const links = await fetchAll<{ reservation_id: string }>((from, to) =>
      service.schema("hotel").from("reservation_guests").select("reservation_id").in("guest_id", part).order("reservation_id").range(from, to),
    );
    for (const l of links) reservationIds.add(l.reservation_id);
  }
  const stays: StayInput[] = [];
  for (const part of chunks([...reservationIds])) {
    const { data } = await service.schema("hotel").from("reservations").select(RES_SELECT).eq("tenant_id", tenantId).in("id", part);
    stays.push(...((data ?? []) as unknown as ReservationRow[]).map(toStayInput));
  }
  return stays;
}

/** The bill totals for the given stays. A stay with no bill lines maps to null. */
export async function loadBilled(service: SupabaseClient, tenantId: string, reservationIds: string[]): Promise<Map<string, StayBilled | null>> {
  const lines = new Map<string, { kind: string; amount: number; department: string | null; voided_at: string | null }[]>();
  for (const part of chunks(reservationIds)) {
    const rows = await fetchAll<{ reservation_id: string; kind: string; amount: number | string; department: string | null; voided_at: string | null }>(
      (from, to) =>
        service
          .schema("hotel")
          .from("folio_transactions")
          .select("reservation_id,kind,amount,department,voided_at")
          .eq("tenant_id", tenantId)
          .in("reservation_id", part)
          .in("kind", ["charge", "discount"])
          .order("id")
          .range(from, to),
    );
    for (const r of rows) {
      const list = lines.get(r.reservation_id) ?? [];
      list.push({ kind: r.kind, amount: Number(r.amount) || 0, department: r.department, voided_at: r.voided_at });
      lines.set(r.reservation_id, list);
    }
  }
  const out = new Map<string, StayBilled | null>();
  for (const id of reservationIds) out.set(id, sumBilled(lines.get(id) ?? []));
  return out;
}

/** Figures for the named guests, or for every guest in the hotel. */
export async function loadGuestMetrics(service: SupabaseClient, tenantId: string, guestIds?: string[]): Promise<Map<string, GuestMetrics>> {
  const stays = await loadStays(service, tenantId, guestIds);
  const counted = stays.filter((s) => s.status === "checked_in" || s.status === "checked_out").map((s) => s.id);
  const billed = await loadBilled(service, tenantId, counted);
  const all = foldGuestMetrics(stays, billed);
  if (!guestIds) return all;
  const wanted = new Set(guestIds);
  for (const id of [...all.keys()]) if (!wanted.has(id)) all.delete(id);
  return all;
}
