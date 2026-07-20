import type { OccupancyTrend } from "@/components/hms/dashboard/analytics/dashboard-analytics-types";
import type { FrontDeskAccent } from "@/lib/hms/frontdesk-capabilities";
import { FRONT_DESK_PAGE_BLOCKS } from "@/lib/hms/frontdesk-capabilities";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount, roomTypeGridAbbrev } from "@/lib/hms/room-pricing";
import { normalizeFloorPlan } from "@/lib/hms/floor-plan";
import { formatAuditMessage } from "@/lib/hms/front-desk-ops";
import { getGrossRevenueForUtcDay } from "@/lib/hms/dashboard-revenue-series";
import type { DashboardFbOrderRow } from "@/lib/hms/dashboard-fb-metrics";
import { countChildrenJson, countInHouseGuestHeadcount } from "@/lib/hms/reservation-metrics";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { computeFolioBalance, mapFolioLineRow, type FolioLineRow } from "@/lib/hms/folio";

export type PaymentDisplayStatus = "paid" | "partial" | "unpaid" | "refund_pending" | "unknown";

export type FrontDeskKpiTile = {
  key: string;
  title: string;
  subtitle: string;
  value: string;
  detail: string;
  accent: FrontDeskAccent;
};

export type FrontDeskOccupancyStats = {
  totalRooms: number;
  occupiedRooms: number;
  availableRooms: number;
  reservedRooms: number;
  maintenanceRooms: number;
  occupancyPercent: number;
  /** Adults + children on checked-in stays — same as dashboard Guests. */
  inHouseGuestHeadcount: number;
};

export type FrontDeskMovementItem = {
  id: string;
  kind: "arrival" | "departure";
  guestName: string;
  guestId: string | null;
  roomCode: string | null;
  time: string;
  timeIso: string;
  bookingSourceLabel: string;
  isVip: boolean;
  paymentLabel: string;
  highlight: "none" | "overdue" | "soon";
  confirmationCode: string;
  canCheckOut?: boolean;
};

export type FrontDeskNotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  createdAt: string;
  read: boolean;
};

export type FrontDeskShiftNoteItem = {
  id: string;
  body: string;
  priority: string;
  authorName: string;
  shiftDate: string;
  resolved: boolean;
  createdAt: string;
};

export type FrontDeskAuditItem = {
  id: string;
  message: string;
  createdAt: string;
};

export type RoomUnitFlags = {
  dnd: boolean;
  securityHold: boolean;
  staffRestricted: boolean;
};

export type HousekeepingTaskInfo = {
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  inspectedAt: string | null;
  assignedStaffId: string | null;
  priorityLevel?: string;
  dueBy?: string | null;
};

export type FrontDeskDisplayStatus =
  | "overdueCheckout"
  | "available"
  | "reserved"
  | "dirty"
  | "maintenance"
  | "outOfService"
  | "inHouse";

export const FRONT_DESK_STATUS_LABELS: Record<FrontDeskDisplayStatus, string> = {
  overdueCheckout: "Overdue checkout",
  available: "Available",
  reserved: "Reserved",
  dirty: "Dirty / cleaning",
  maintenance: "Maintenance",
  outOfService: "Out of service",
  inHouse: "In-house",
};

/** Shorter labels for compact room grid cells */
export const FRONT_DESK_STATUS_SHORT_LABELS: Record<FrontDeskDisplayStatus, string> = {
  overdueCheckout: "Overdue",
  available: "Available",
  reserved: "Reserved",
  dirty: "Dirty",
  maintenance: "Maint.",
  outOfService: "OOO",
  inHouse: "In-house",
};

export type FrontDeskGuestInfo = {
  id: string;
  title: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  displayName: string;
  phone: string;
  email: string;
  whatsapp: string | null;
  nationality: string;
  idType: string;
  idNumber: string;
  idExpiryDate: string;
  dateOfBirth: string;
  gender: string | null;
  preferredChannel: string;
  tags: string[];
};

export type FrontDeskSummaryCounts = {
  overdueCheckout: number;
  available: number;
  reserved: number;
  dirty: number;
  maintenance: number;
  outOfService: number;
  inHouse: number;
};

export type FrontDeskPartyGuest = FrontDeskGuestInfo & {
  isPrimary: boolean;
  relationship: string;
};

export type FrontDeskStayInfo = {
  reservationId: string;
  confirmationCode: string;
  guest: FrontDeskGuestInfo | null;
  guestId: string | null;
  guestName: string;
  /** Every guest on the reservation (primary + additional adults + children). */
  partyGuests: FrontDeskPartyGuest[];
  partySize: number;
  adults: number;
  childrenCount: number;
  phone: string;
  email: string;
  arrivalAt: string;
  checkInAt: string | null;
  checkOutAt: string;
  departureAt: string;
  settlementMethod: string;
  paymentLabel: string;
  paymentStatus: PaymentDisplayStatus;
  bookingSourceLabel: string;
  isVip: boolean;
  totalRoomCharges: number;
  ratePerNight: number;
  guestRemarks: string | null;
  folioNumber: string;
};

export type FrontDeskRoomBoardItem = {
  id: string;
  roomCode: string;
  floor: number;
  roomTypeCode: string;
  roomTypeName: string;
  /** Short label for compact grid (from room_types.shortLabel or derived). */
  roomTypeGridAbbrev: string;
  unitStatus: string;
  notes: string | null;
  displayStatus: FrontDeskDisplayStatus;
  statusLabel: string;
  statusShortLabel: string;
  stay: FrontDeskStayInfo | null;
  reservedStay: FrontDeskStayInfo | null;
  lastCheckoutAt: string | null;
  roomFlags: RoomUnitFlags;
  paymentStatus: PaymentDisplayStatus | null;
  housekeeping: HousekeepingTaskInfo | null;
};

export type FrontDeskCheckoutItem = {
  guestName: string;
  guestId: string | null;
  roomCode: string;
  checkoutTime: string;
  timeIso: string;
  paymentLabel: string;
  paymentStatus: PaymentDisplayStatus;
  bookingSourceLabel: string;
  isVip: boolean;
  confirmationCode: string;
  highlight: "none" | "overdue" | "soon";
};

export type FrontDeskPendingArrivalItem = {
  guestName: string;
  guestId: string | null;
  roomCode: string | null;
  checkInTime: string;
  timeIso: string;
  bookingSourceLabel: string;
  isVip: boolean;
  confirmationCode: string;
  highlight: "none" | "overdue" | "soon";
};

export type FrontDeskAnalytics = {
  occupancyTrend: OccupancyTrend;
  dailyCheckIns: { labels: string[]; values: number[] };
  dailyCheckOuts: { labels: string[]; values: number[] };
  roomMix: { available: number; occupied: number };
  revenueToday: string;
  occupancyRate: number;
  inHouseGuestHeadcount: number;
};

export type CalendarWeekStay = {
  reservationId: string;
  guestName: string;
  roomCode: string | null;
  roomUnitId: string | null;
  confirmationCode: string;
  startDate: string;
  endDate: string;
};

export type FrontDeskCalendarWeek = {
  dayLabels: string[];
  dayStarts: string[];
  stays: CalendarWeekStay[];
};

export type FrontDeskBoardData = {
  tenantId: string | null;
  calendarWeek: FrontDeskCalendarWeek;
  summaryCounts: FrontDeskSummaryCounts;
  kpiTiles: FrontDeskKpiTile[];
  occupancy: FrontDeskOccupancyStats;
  floors: number[];
  roomsByFloor: Record<number, FrontDeskRoomBoardItem[]>;
  arrivalsToday: FrontDeskMovementItem[];
  departuresToday: FrontDeskMovementItem[];
  expectedCheckoutsToday: FrontDeskCheckoutItem[];
  pendingCheckInsToday: FrontDeskPendingArrivalItem[];
  notifications: FrontDeskNotificationItem[];
  unreadNotificationCount: number;
  shiftNotes: FrontDeskShiftNoteItem[];
  auditFeed: FrontDeskAuditItem[];
  analytics: FrontDeskAnalytics;
  currency: string;
  /** Total reservations on file — same as dashboard Reservations card. */
  reservationRecordCount: number;
};

type RoomUnitRow = {
  id: string;
  room_code: string;
  floor: number;
  room_type_code: string;
  status: string;
  notes: string | null;
  created_at: string;
};

type ReservationRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  room_unit_id: string | null;
  room_type_code: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  settlement_method: string;
  preauth_amount: string | number | null;
  total_room_charges: string | number;
  rate_per_night: string | number;
  guest_remarks: string | null;
  folio_number: string;
  vip_flag: boolean;
  source: string;
  booking_channel: string | null;
  adults: number;
  children_json: unknown;
};

type GuestRow = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  nationality: string;
  id_type: string;
  id_number: string;
  id_expiry_date: string;
  date_of_birth: string;
  gender: string | null;
  phone: string;
  email: string;
  whatsapp: string | null;
  preferred_channel: string;
  tags?: unknown;
};

function parseGuestTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is string => typeof t === "string");
}

export function guestHasVipTag(guest?: Pick<GuestRow, "tags">) {
  return parseGuestTags(guest?.tags).some((t) => t.toLowerCase() === "vip");
}

type ReservationGuestRow = {
  reservation_id: string;
  guest_id: string;
  is_primary: boolean;
  relationship: string | null;
};

type ReservationGuestEmbed = {
  is_primary: boolean;
  relationship: string | null;
  guests: GuestRow | GuestRow[] | null;
};

type StayGuestRow = GuestRow & {
  isPrimary: boolean;
  relationship: string;
};

type ReservationGuestsResolved = {
  primaryByReservation: Map<string, GuestRow>;
  partyByReservation: Map<string, StayGuestRow[]>;
};

export function formatGuestDisplayName(guest: GuestRow) {
  const title = guest.title?.trim();
  const name = `${guest.first_name} ${guest.last_name}`.trim();
  return title ? `${title} ${name}` : name;
}

export function toGuestInfo(guest: GuestRow): FrontDeskGuestInfo {
  const fullName = `${guest.first_name} ${guest.last_name}`.trim();
  return {
    id: guest.id,
    title: guest.title,
    firstName: guest.first_name,
    lastName: guest.last_name,
    fullName,
    displayName: formatGuestDisplayName(guest),
    phone: guest.phone,
    email: guest.email,
    whatsapp: guest.whatsapp,
    nationality: guest.nationality,
    idType: guest.id_type.replace(/_/g, " "),
    idNumber: guest.id_number,
    idExpiryDate: guest.id_expiry_date,
    dateOfBirth: guest.date_of_birth,
    gender: guest.gender,
    preferredChannel: guest.preferred_channel,
    tags: parseGuestTags(guest.tags),
  };
}

function embedGuestRow(raw: GuestRow | GuestRow[] | null): GuestRow | undefined {
  if (!raw) return undefined;
  return Array.isArray(raw) ? raw[0] : raw;
}

function collectEmbeddedStayGuests(
  embeds: ReservationGuestEmbed[] | null | undefined,
): StayGuestRow[] {
  if (!embeds?.length) return [];
  return embeds
    .map((embed) => {
      const row = embedGuestRow(embed.guests);
      if (!row) return null;
      return {
        ...row,
        isPrimary: embed.is_primary,
        relationship:
          embed.relationship?.trim() || (embed.is_primary ? "primary" : "guest"),
      };
    })
    .filter((g): g is StayGuestRow => Boolean(g))
    .sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.relationship.localeCompare(b.relationship);
    });
}

function toPartyGuest(guest: StayGuestRow): FrontDeskPartyGuest {
  return {
    ...toGuestInfo(guest),
    isPrimary: guest.isPrimary,
    relationship: guest.relationship,
  };
}

async function resolveReservationGuests(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  guestSelect: string,
  reservationsRaw: { id: string; reservation_guests?: ReservationGuestEmbed[] | null }[],
): Promise<ReservationGuestsResolved> {
  const primaryByReservation = new Map<string, GuestRow>();
  const partyByReservation = new Map<string, StayGuestRow[]>();

  for (const row of reservationsRaw) {
    const party = collectEmbeddedStayGuests(row.reservation_guests);
    if (!party.length) continue;
    partyByReservation.set(row.id, party);
    const primary = party.find((g) => g.isPrimary) ?? party[0];
    primaryByReservation.set(row.id, primary);
  }

  const missingIds = reservationsRaw
    .map((r) => r.id)
    .filter((id) => !partyByReservation.has(id));
  if (!missingIds.length) {
    return { primaryByReservation, partyByReservation };
  }

  const [{ data: rgRows }, { data: tenantGuestRows }] = await Promise.all([
    supabase
      .schema("hotel")
      .from("reservation_guests")
      .select("reservation_id,guest_id,is_primary,relationship")
      .in("reservation_id", missingIds),
    supabase.schema("hotel").from("guests").select(guestSelect).eq("tenant_id", tenantId),
  ]);

  const guestById = new Map(
    ((tenantGuestRows ?? []) as unknown as GuestRow[]).map((g) => [g.id, g]),
  );
  const linksByReservation = new Map<string, ReservationGuestRow[]>();
  for (const link of (rgRows ?? []) as ReservationGuestRow[]) {
    const list = linksByReservation.get(link.reservation_id) ?? [];
    list.push(link);
    linksByReservation.set(link.reservation_id, list);
  }

  for (const [resId, links] of linksByReservation) {
    const party: StayGuestRow[] = [];
    for (const link of links) {
      const guest = guestById.get(link.guest_id);
      if (!guest) continue;
      party.push({
        ...guest,
        isPrimary: link.is_primary,
        relationship: link.relationship?.trim() || (link.is_primary ? "primary" : "guest"),
      });
    }
    party.sort((a, b) => {
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.relationship.localeCompare(b.relationship);
    });
    if (!party.length) continue;
    partyByReservation.set(resId, party);
    primaryByReservation.set(resId, party.find((g) => g.isPrimary) ?? party[0]);
  }

  return { primaryByReservation, partyByReservation };
}

function parseTs(value: string) {
  return new Date(value).getTime();
}

function utcDayRangeIso(reference = new Date()) {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();
  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const next = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), nextIso: next.toISOString() };
}

function inUtcDay(value: string, reference = new Date()) {
  const t = parseTs(value);
  const { startIso, nextIso } = utcDayRangeIso(reference);
  return t >= parseTs(startIso) && t < parseTs(nextIso);
}

function num(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function settlementLabel(method: string) {
  const map: Record<string, string> = {
    cash: "Cash",
    card: "Credit card",
    pos: "POS",
    split: "Split",
    direct_bill: "Direct bill",
    partial_credit: "Partial credit",
  };
  return map[method] ?? method;
}

function floorLabel(floor: number) {
  const ordinals = ["", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth"];
  if (floor >= 1 && floor <= 10) return `${ordinals[floor]} Floor`;
  return `Floor ${floor}`;
}

export { floorLabel };

export function bookingSourceLabel(reservation: Pick<ReservationRow, "source" | "booking_channel">) {
  const channel = reservation.booking_channel?.trim();
  const sourceMap: Record<string, string> = {
    walk_in: "Walk-in",
    phone: "Phone",
    referral: "Referral",
    ota: "OTA",
    website: "Website",
    travel_agent: "Travel agent",
  };
  const base = sourceMap[reservation.source] ?? reservation.source;
  return channel ? `${base} · ${channel}` : base;
}

export function derivePaymentStatus(
  reservation: Pick<ReservationRow, "settlement_method" | "preauth_amount" | "total_room_charges" | "status">,
  folioLines?: FolioLineRow[],
): PaymentDisplayStatus {
  if (folioLines && folioLines.length > 0) {
    return computeFolioBalance(folioLines, {
      settlementMethod: reservation.settlement_method,
      preauthAmount:
        reservation.preauth_amount != null ? num(reservation.preauth_amount) : null,
      totalRoomCharges: num(reservation.total_room_charges),
      status: reservation.status,
    }).displayStatus;
  }
  if (reservation.status === "cancelled") return "unknown";
  if (reservation.settlement_method === "cash" && reservation.status === "checked_in") return "unpaid";
  if (
    (reservation.settlement_method === "card" ||
      reservation.settlement_method === "pos" ||
      reservation.settlement_method === "partial_credit") &&
    reservation.preauth_amount == null
  ) {
    return "unpaid";
  }
  if (reservation.settlement_method === "direct_bill") return "partial";
  if (reservation.status === "checked_in") return "unpaid";
  return "unknown";
}

function buildStayInfo(
  reservation: ReservationRow,
  guest: GuestRow | undefined,
  folioLines: FolioLineRow[] = [],
  partyGuests: StayGuestRow[] = [],
): FrontDeskStayInfo {
  const party =
    partyGuests.length > 0
      ? partyGuests.map(toPartyGuest)
      : guest
        ? [toPartyGuest({ ...guest, isPrimary: true, relationship: "primary" })]
        : [];

  const primaryParty = party.find((g) => g.isPrimary) ?? party[0] ?? null;
  const guestInfo = primaryParty;
  const childrenCount = countChildrenJson(reservation.children_json);
  const partySize = reservation.adults + childrenCount;

  return {
    reservationId: reservation.id,
    confirmationCode: reservation.confirmation_code,
    guest: guestInfo,
    guestId: guestInfo?.id ?? null,
    guestName:
      party.length > 1
        ? party.map((g) => g.displayName).join(" · ")
        : guestInfo?.displayName ?? "Guest not linked",
    partyGuests: party,
    partySize,
    adults: reservation.adults,
    childrenCount,
    phone: guestInfo?.phone ?? "—",
    email: guestInfo?.email ?? "—",
    arrivalAt: reservation.arrival_at,
    checkInAt: reservation.checked_in_at,
    checkOutAt: reservation.departure_at,
    departureAt: reservation.departure_at,
    settlementMethod: reservation.settlement_method,
    paymentLabel: settlementLabel(reservation.settlement_method),
    paymentStatus: derivePaymentStatus(reservation, folioLines),
    bookingSourceLabel: bookingSourceLabel(reservation),
    isVip: reservation.vip_flag || guestHasVipTag(guest),
    totalRoomCharges: num(reservation.total_room_charges),
    ratePerNight: num(reservation.rate_per_night),
    guestRemarks: reservation.guest_remarks,
    folioNumber: reservation.folio_number,
  };
}

function movementHighlight(
  kind: "arrival" | "departure",
  iso: string,
  now: Date,
  isOverdueDeparture: boolean,
): "none" | "overdue" | "soon" {
  if (kind === "departure" && isOverdueDeparture) return "overdue";
  const t = parseTs(iso);
  const diff = t - now.getTime();
  if (diff >= 0 && diff <= 60 * 60 * 1000) return "soon";
  return "none";
}

export function resolveRoomDisplayStatus(params: {
  unitStatus: string;
  activeStay: ReservationRow | null;
  reservedStay: ReservationRow | null;
  now: Date;
}): FrontDeskDisplayStatus {
  const { unitStatus, activeStay, reservedStay, now } = params;
  const nowMs = now.getTime();

  if (activeStay?.status === "checked_in") {
    if (parseTs(activeStay.departure_at) < nowMs) return "overdueCheckout";
    return "inHouse";
  }

  if (reservedStay?.status === "confirmed") return "reserved";

  if (unitStatus === "out_of_order") return "outOfService";
  if (unitStatus === "maintenance") return "maintenance";
  if (unitStatus === "dirty" || unitStatus === "cleaning_in_progress") return "dirty";

  if (
    unitStatus === "vacant_clean" ||
    unitStatus === "inspected" ||
    unitStatus === "ready_for_occupancy"
  ) {
    return "available";
  }
  if (unitStatus === "occupied") return "available";

  return "available";
}

const DEFAULT_ROOM_FLAGS: RoomUnitFlags = {
  dnd: false,
  securityHold: false,
  staffRestricted: false,
};

function kpiRegistry() {
  const block = FRONT_DESK_PAGE_BLOCKS.find(
    (b): b is Extract<typeof b, { type: "section" }> => b.type === "section" && b.id === "dashboard-kpis",
  );
  return new Map((block?.cards ?? []).map((c) => [c.key, c]));
}

function buildKpiTiles(params: {
  arrivalsTodayTotal: number;
  arrivalsCheckedIn: number;
  departuresTodayTotal: number;
  departuresCheckedOut: number;
  inHouseGuests: number;
  roomsReady: number;
  overdueCheckouts: number;
  openRequests: number;
  vipArrivalsToday: number;
  unpreauthedRooms: number;
}): FrontDeskKpiTile[] {
  const reg = kpiRegistry();
  const pick = (key: string) => reg.get(key);

  const specs: Array<{
    key: string;
    value: string;
    detail: string;
    accent: FrontDeskAccent;
  }> = [
    {
      key: "arrivals-kpi",
      value: `${params.arrivalsCheckedIn}/${params.arrivalsTodayTotal}`,
      detail: `${params.arrivalsTodayTotal - params.arrivalsCheckedIn} pending check-in`,
      accent: "checkin",
    },
    {
      key: "departures-kpi",
      value: `${params.departuresCheckedOut}/${params.departuresTodayTotal}`,
      detail: `${params.departuresTodayTotal - params.departuresCheckedOut} still in-house`,
      accent: "checkin",
    },
    {
      key: "in-house-count",
      value: String(params.inHouseGuests),
      detail: "Guests on property",
      accent: "checkin",
    },
    {
      key: "rooms-ready",
      value: String(params.roomsReady),
      detail: "Clean / inspected / ready",
      accent: "rooms",
    },
    {
      key: "open-requests",
      value: String(params.openRequests),
      detail: "Service requests module",
      accent: "incidents",
    },
    {
      key: "vip-arrivals",
      value: String(params.vipArrivalsToday),
      detail: "VIP flagged today",
      accent: "guest",
    },
    {
      key: "overdue-checkouts",
      value: String(params.overdueCheckouts),
      detail: params.overdueCheckouts > 0 ? "Past checkout time" : "All clear",
      accent: "incidents",
    },
    {
      key: "unpreauthed-rooms",
      value: String(params.unpreauthedRooms),
      detail: "Card stays without card auth or payment",
      accent: "financial",
    },
  ];

  return specs.map((s) => {
    const card = pick(s.key);
    return {
      key: s.key,
      title: card?.title ?? s.key,
      subtitle: card?.subtitle ?? "",
      value: s.value,
      detail: s.detail,
      accent: card?.accent ?? s.accent,
    };
  });
}

function buildOccupancyTrend(
  reservations: ReservationRow[],
  totalRooms: number,
  monthsBack = 6,
): OccupancyTrend {
  const now = new Date();
  const labels: string[] = [];
  const values: number[] = [];
  const safeRooms = Math.max(totalRooms, 1);

  for (let i = monthsBack - 1; i >= 0; i -= 1) {
    const anchor = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const y = anchor.getUTCFullYear();
    const m = anchor.getUTCMonth();
    const start = Date.UTC(y, m, 1, 0, 0, 0, 0);
    const end = Date.UTC(y, m + 1, 1, 0, 0, 0, 0);
    labels.push(
      new Date(Date.UTC(y, m, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
    );

    let roomNights = 0;
    const daysInMonth = Math.round((end - start) / 86400000);
    for (const r of reservations) {
      if (r.status === "cancelled" || r.status === "no_show") continue;
      const a = parseTs(r.arrival_at);
      const dep = parseTs(r.departure_at);
      const overlapStart = Math.max(a, start);
      const overlapEnd = Math.min(dep, end);
      if (overlapEnd > overlapStart) {
        const nights = Math.ceil((overlapEnd - overlapStart) / 86400000);
        roomNights += Math.max(nights, 1);
      }
    }
    const capacity = safeRooms * daysInMonth;
    values.push(Math.min(100, Math.round((roomNights / capacity) * 100)));
  }

  return { labels, values };
}

function buildDailyMovementSeries(
  reservations: ReservationRow[],
  field: "checked_in_at" | "checked_out_at",
  days = 7,
) {
  const now = new Date();
  const labels: string[] = [];
  const values: number[] = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    labels.push(
      d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    );
    const count = reservations.filter((r) => {
      const ts = r[field];
      return ts ? inUtcDay(ts, d) : false;
    }).length;
    values.push(count);
  }

  return { labels, values };
}

function emptyBoard(currency: string): FrontDeskBoardData {
  const emptyOccupancy: FrontDeskOccupancyStats = {
    totalRooms: 0,
    occupiedRooms: 0,
    availableRooms: 0,
    reservedRooms: 0,
    maintenanceRooms: 0,
    occupancyPercent: 0,
    inHouseGuestHeadcount: 0,
  };
  return {
    tenantId: null,
    summaryCounts: {
      overdueCheckout: 0,
      available: 0,
      reserved: 0,
      dirty: 0,
      maintenance: 0,
      outOfService: 0,
      inHouse: 0,
    },
    kpiTiles: buildKpiTiles({
      arrivalsTodayTotal: 0,
      arrivalsCheckedIn: 0,
      departuresTodayTotal: 0,
      departuresCheckedOut: 0,
      inHouseGuests: 0,
      roomsReady: 0,
      overdueCheckouts: 0,
      openRequests: 0,
      vipArrivalsToday: 0,
      unpreauthedRooms: 0,
    }),
    occupancy: emptyOccupancy,
    floors: [],
    roomsByFloor: {},
    arrivalsToday: [],
    departuresToday: [],
    expectedCheckoutsToday: [],
    pendingCheckInsToday: [],
    notifications: [],
    unreadNotificationCount: 0,
    shiftNotes: [],
    auditFeed: [],
    calendarWeek: { dayLabels: [], dayStarts: [], stays: [] },
    analytics: {
      occupancyTrend: { labels: [], values: [] },
      dailyCheckIns: { labels: [], values: [] },
      dailyCheckOuts: { labels: [], values: [] },
      roomMix: { available: 0, occupied: 0 },
      revenueToday: formatPricingAmount(0, currency),
      occupancyRate: 0,
      inHouseGuestHeadcount: 0,
    },
    currency,
    reservationRecordCount: 0,
  };
}

export async function getFrontDeskBoardData(params: {
  tenantId: string | null;
  floorPlanRaw: unknown;
  roomTypes: HotelRoomTypeSetup[];
  currency: string;
}): Promise<FrontDeskBoardData> {
  const { tenantId, floorPlanRaw, roomTypes, currency } = params;
  if (!tenantId) return emptyBoard(currency);

  const supabase = createServerSupabaseClient();
  const roomTypeNameByCode = new Map(roomTypes.map((t) => [t.id, t.name]));
  const roomTypeGridAbbrevById = new Map(roomTypes.map((t) => [t.id, roomTypeGridAbbrev(t)]));

  const guestSelect =
    "id,title,first_name,last_name,nationality,id_type,id_number,id_expiry_date,date_of_birth,gender,phone,email,whatsapp,preferred_channel,tags";

  const [
    { data: roomRows, error: roomError },
    { data: resRows, error: resError },
    { data: flagRows },
    { data: folioRows },
    { data: notificationRows },
    { data: shiftNoteRows },
    { data: auditRows },
    { data: profileRows },
    { data: hkRows },
    { data: paymentIntentRows },
    { data: fbOrderRows },
  ] = await Promise.all([
    supabase
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,floor,room_type_code,status,notes,created_at")
      .eq("tenant_id", tenantId)
      .order("room_code"),
    supabase
      .schema("hotel")
      .from("reservations")
      .select(
        `id,confirmation_code,status,arrival_at,departure_at,room_unit_id,room_type_code,checked_in_at,checked_out_at,settlement_method,preauth_amount,total_room_charges,rate_per_night,guest_remarks,folio_number,vip_flag,source,booking_channel,adults,children_json,reservation_guests(is_primary,relationship,guests(${guestSelect}))`,
      )
      .eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("room_unit_flags")
      .select("room_unit_id,dnd,security_hold,staff_restricted")
      .eq("tenant_id", tenantId),
    supabase.schema("hotel").from("folio_transactions").select("*").eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("notifications")
      .select("id,type,title,body,severity,created_at,read_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .schema("hotel")
      .from("shift_notes")
      .select("id,body,priority,author_user_id,shift_date,resolved_at,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .schema("hotel")
      .from("audit_logs")
      .select("id,actor_user_id,action,entity_type,before_state,after_state,created_at")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .schema("hotel")
      .from("profiles")
      .select("user_id,contact_name")
      .eq("tenant_id", tenantId),
    supabase
      .schema("hotel")
      .from("housekeeping_tasks")
      .select(
        "room_unit_id,status,started_at,completed_at,inspected_at,assigned_staff_id,priority_level,due_by",
      )
      .eq("tenant_id", tenantId)
      .neq("status", "ready"),
    supabase
      .schema("hotel")
      .from("payment_intents")
      .select("reservation_id,purpose,status")
      .eq("tenant_id", tenantId)
      .eq("status", "success"),
    supabase
      .schema("hotel")
      .from("fb_orders")
      .select("status,settlement_method,subtotal,closed_at,voided_at")
      .eq("tenant_id", tenantId),
  ]);

  if (roomError || resError) {
    console.warn("[front-desk-board] query failed:", roomError ?? resError);
    return emptyBoard(currency);
  }

  const rooms = (roomRows ?? []) as RoomUnitRow[];
  if (rooms.length === 0) return emptyBoard(currency);

  type ReservationWithGuests = ReservationRow & {
    reservation_guests?: ReservationGuestEmbed[] | null;
  };

  const reservationsRaw = (resRows ?? []) as ReservationWithGuests[];
  const reservations: ReservationRow[] = reservationsRaw.map(
    ({ reservation_guests: _rg, ...row }) => row as ReservationRow,
  );

  const folioLinesByReservation = new Map<string, FolioLineRow[]>();
  for (const tx of folioRows ?? []) {
    const row = mapFolioLineRow(tx as Record<string, unknown>);
    const list = folioLinesByReservation.get(row.reservation_id) ?? [];
    list.push(row);
    folioLinesByReservation.set(row.reservation_id, list);
  }

  const cardSecuredReservationIds = new Set<string>();
  for (const intent of paymentIntentRows ?? []) {
    const rid = (intent as { reservation_id: string | null }).reservation_id;
    if (rid) cardSecuredReservationIds.add(rid);
  }
  for (const tx of folioRows ?? []) {
    const row = mapFolioLineRow(tx as Record<string, unknown>);
    if (
      row.kind === "payment" &&
      !row.voided_at &&
      (row.method === "card" || row.metadata?.provider === "paystack")
    ) {
      cardSecuredReservationIds.add(row.reservation_id);
    }
  }

  const flagsByRoom = new Map<string, RoomUnitFlags>();
  for (const f of (flagRows ?? []) as {
    room_unit_id: string;
    dnd: boolean;
    security_hold: boolean;
    staff_restricted: boolean;
  }[]) {
    flagsByRoom.set(f.room_unit_id, {
      dnd: f.dnd,
      securityHold: f.security_hold,
      staffRestricted: f.staff_restricted,
    });
  }

  const actorNameByUserId = new Map<string, string>();
  for (const p of (profileRows ?? []) as { user_id: string; contact_name: string | null }[]) {
    if (p.contact_name) actorNameByUserId.set(p.user_id, p.contact_name);
  }

  const hkByRoom = new Map<string, HousekeepingTaskInfo>();
  for (const t of (hkRows ?? []) as {
    room_unit_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    inspected_at: string | null;
    assigned_staff_id: string | null;
    priority_level?: string;
    due_by?: string | null;
  }[]) {
    hkByRoom.set(t.room_unit_id, {
      status: t.status,
      startedAt: t.started_at,
      completedAt: t.completed_at,
      inspectedAt: t.inspected_at,
      assignedStaffId: t.assigned_staff_id,
      priorityLevel: t.priority_level,
      dueBy: t.due_by,
    });
  }

  const { primaryByReservation: guestByReservation, partyByReservation } =
    await resolveReservationGuests(supabase, tenantId, guestSelect, reservationsRaw);

  const now = new Date();
  const inHouseByRoom = new Map<string, ReservationRow>();
  const reservedByRoom = new Map<string, ReservationRow>();
  const lastCheckoutByRoom = new Map<string, string>();

  for (const r of reservations) {
    if (!r.room_unit_id) continue;
    if (r.status === "checked_in") {
      inHouseByRoom.set(r.room_unit_id, r);
    } else if (r.status === "confirmed") {
      const existing = reservedByRoom.get(r.room_unit_id);
      if (!existing || parseTs(r.arrival_at) < parseTs(existing.arrival_at)) {
        reservedByRoom.set(r.room_unit_id, r);
      }
    }
    if (r.status === "checked_out" && r.checked_out_at) {
      const prev = lastCheckoutByRoom.get(r.room_unit_id);
      if (!prev || parseTs(r.checked_out_at) > parseTs(prev)) {
        lastCheckoutByRoom.set(r.room_unit_id, r.checked_out_at);
      }
    }
  }

  const boardRooms: FrontDeskRoomBoardItem[] = rooms.map((room) => {
    const activeStay = inHouseByRoom.get(room.id) ?? null;
    const reservedStay = reservedByRoom.get(room.id) ?? null;
    const displayStatus = resolveRoomDisplayStatus({
      unitStatus: room.status,
      activeStay,
      reservedStay,
      now,
    });
    const guestForActive = activeStay ? guestByReservation.get(activeStay.id) : undefined;
    const guestForReserved = reservedStay ? guestByReservation.get(reservedStay.id) : undefined;

    const stayRow = activeStay ?? reservedStay;
    const stayFolioLines = stayRow ? folioLinesByReservation.get(stayRow.id) ?? [] : [];
    const paymentStatus = stayRow ? derivePaymentStatus(stayRow, stayFolioLines) : null;

    return {
      id: room.id,
      roomCode: room.room_code,
      floor: room.floor,
      roomTypeCode: room.room_type_code,
      roomTypeName: roomTypeNameByCode.get(room.room_type_code) ?? room.room_type_code,
      roomTypeGridAbbrev:
        roomTypeGridAbbrevById.get(room.room_type_code) ??
        (room.room_type_code.length > 12
          ? room.room_type_code.slice(0, 4)
          : room.room_type_code),
      unitStatus: room.status,
      notes: room.notes,
      displayStatus,
      statusLabel: FRONT_DESK_STATUS_LABELS[displayStatus],
      statusShortLabel: FRONT_DESK_STATUS_SHORT_LABELS[displayStatus],
      stay: activeStay
        ? buildStayInfo(
            activeStay,
            guestForActive,
            folioLinesByReservation.get(activeStay.id) ?? [],
            partyByReservation.get(activeStay.id) ?? [],
          )
        : null,
      reservedStay: reservedStay
        ? buildStayInfo(
            reservedStay,
            guestForReserved,
            folioLinesByReservation.get(reservedStay.id) ?? [],
            partyByReservation.get(reservedStay.id) ?? [],
          )
        : null,
      lastCheckoutAt: lastCheckoutByRoom.get(room.id) ?? null,
      roomFlags: flagsByRoom.get(room.id) ?? DEFAULT_ROOM_FLAGS,
      paymentStatus,
      housekeeping: hkByRoom.get(room.id) ?? null,
    };
  });

  const summaryCounts: FrontDeskSummaryCounts = {
    overdueCheckout: 0,
    available: 0,
    reserved: 0,
    dirty: 0,
    maintenance: 0,
    outOfService: 0,
    inHouse: 0,
  };

  for (const room of boardRooms) {
    switch (room.displayStatus) {
      case "overdueCheckout":
        summaryCounts.overdueCheckout += 1;
        break;
      case "available":
        summaryCounts.available += 1;
        break;
      case "reserved":
        summaryCounts.reserved += 1;
        break;
      case "dirty":
        summaryCounts.dirty += 1;
        break;
      case "maintenance":
        summaryCounts.maintenance += 1;
        break;
      case "outOfService":
        summaryCounts.outOfService += 1;
        break;
      case "inHouse":
        summaryCounts.inHouse += 1;
        break;
      default:
        break;
    }
  }

  const unassignedArrivalsToday = reservations.filter(
    (r) => r.status === "confirmed" && !r.room_unit_id && inUtcDay(r.arrival_at, now),
  );
  summaryCounts.reserved += unassignedArrivalsToday.length;

  const planFloors = normalizeFloorPlan(floorPlanRaw).map((e) => e.floor);
  const roomFloors = [...new Set(boardRooms.map((r) => r.floor))];
  const floors = [...new Set([...planFloors, ...roomFloors])].sort((a, b) => a - b);

  const roomsByFloor: Record<number, FrontDeskRoomBoardItem[]> = {};
  for (const fl of floors) {
    roomsByFloor[fl] = boardRooms
      .filter((r) => r.floor === fl)
      .sort((a, b) => a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true }));
  }

  const mapCheckoutItem = (r: ReservationRow): FrontDeskCheckoutItem => {
    const guest = guestByReservation.get(r.id);
    const room = rooms.find((u) => u.id === r.room_unit_id);
    const isOverdue = r.status === "checked_in" && parseTs(r.departure_at) < now.getTime();
    const lines = folioLinesByReservation.get(r.id) ?? [];
    return {
      guestName: guest ? formatGuestDisplayName(guest) : "Guest not linked",
      guestId: guest?.id ?? null,
      roomCode: room?.room_code ?? "—",
      checkoutTime: formatTime(r.departure_at),
      timeIso: r.departure_at,
      paymentLabel: settlementLabel(r.settlement_method),
      paymentStatus: derivePaymentStatus(r, lines),
      bookingSourceLabel: bookingSourceLabel(r),
      isVip: r.vip_flag,
      confirmationCode: r.confirmation_code,
      highlight: movementHighlight("departure", r.departure_at, now, isOverdue),
    };
  };

  const mapArrivalItem = (r: ReservationRow): FrontDeskPendingArrivalItem => {
    const guest = guestByReservation.get(r.id);
    const room = r.room_unit_id ? rooms.find((u) => u.id === r.room_unit_id) : null;
    return {
      guestName: guest ? formatGuestDisplayName(guest) : "Guest not linked",
      guestId: guest?.id ?? null,
      roomCode: room?.room_code ?? null,
      checkInTime: formatTime(r.arrival_at),
      timeIso: r.arrival_at,
      bookingSourceLabel: bookingSourceLabel(r),
      isVip: r.vip_flag,
      confirmationCode: r.confirmation_code,
      highlight: movementHighlight("arrival", r.arrival_at, now, false),
    };
  };

  const expectedCheckoutsToday: FrontDeskCheckoutItem[] = reservations
    .filter((r) => r.status === "checked_in" && inUtcDay(r.departure_at, now))
    .map(mapCheckoutItem)
    .sort((a, b) => a.timeIso.localeCompare(b.timeIso));

  const pendingCheckInsToday: FrontDeskPendingArrivalItem[] = reservations
    .filter((r) => r.status === "confirmed" && inUtcDay(r.arrival_at, now))
    .map(mapArrivalItem)
    .sort((a, b) => a.timeIso.localeCompare(b.timeIso));

  const arrivalsToday: FrontDeskMovementItem[] = reservations
    .filter((r) => r.status !== "cancelled" && r.status !== "no_show" && inUtcDay(r.arrival_at, now))
    .map((r) => {
      const guest = guestByReservation.get(r.id);
      const room = r.room_unit_id ? rooms.find((u) => u.id === r.room_unit_id) : null;
      return {
        id: r.id,
        kind: "arrival" as const,
        guestName: guest ? formatGuestDisplayName(guest) : "Guest not linked",
        guestId: guest?.id ?? null,
        roomCode: room?.room_code ?? null,
        time: formatTime(r.arrival_at),
        timeIso: r.arrival_at,
        bookingSourceLabel: bookingSourceLabel(r),
        isVip: r.vip_flag,
        paymentLabel: settlementLabel(r.settlement_method),
        highlight: movementHighlight("arrival", r.arrival_at, now, false),
        confirmationCode: r.confirmation_code,
      };
    })
    .sort((a, b) => a.timeIso.localeCompare(b.timeIso));

  const departuresToday: FrontDeskMovementItem[] = reservations
    .filter(
      (r) =>
        (r.status === "checked_in" || r.status === "checked_out") && inUtcDay(r.departure_at, now),
    )
    .map((r) => {
      const guest = guestByReservation.get(r.id);
      const room = rooms.find((u) => u.id === r.room_unit_id);
      const isOverdue = r.status === "checked_in" && parseTs(r.departure_at) < now.getTime();
      return {
        id: r.id,
        kind: "departure" as const,
        guestName: guest ? formatGuestDisplayName(guest) : "Guest not linked",
        guestId: guest?.id ?? null,
        roomCode: room?.room_code ?? null,
        time: formatTime(r.departure_at),
        timeIso: r.departure_at,
        bookingSourceLabel: bookingSourceLabel(r),
        isVip: r.vip_flag,
        paymentLabel: settlementLabel(r.settlement_method),
        highlight: movementHighlight("departure", r.departure_at, now, isOverdue),
        confirmationCode: r.confirmation_code,
        canCheckOut: r.status === "checked_in",
      };
    })
    .sort((a, b) => a.timeIso.localeCompare(b.timeIso));

  const inHouseCount = boardRooms.filter(
    (r) => r.displayStatus === "inHouse" || r.displayStatus === "overdueCheckout",
  ).length;

  const inHouseGuestHeadcount = countInHouseGuestHeadcount(reservations);

  const roomsReady = rooms.filter((u) =>
    ["vacant_clean", "inspected", "ready_for_occupancy"].includes(u.status),
  ).length;

  const arrivalsTodayTotal = reservations.filter(
    (r) => r.status !== "cancelled" && r.status !== "no_show" && inUtcDay(r.arrival_at, now),
  ).length;
  const arrivalsCheckedIn = reservations.filter(
    (r) =>
      inUtcDay(r.arrival_at, now) &&
      (r.status === "checked_in" || (r.checked_in_at && inUtcDay(r.checked_in_at, now))),
  ).length;

  const departuresTodayTotal = reservations.filter(
    (r) =>
      (r.status === "checked_in" || r.status === "checked_out") && inUtcDay(r.departure_at, now),
  ).length;
  const departuresCheckedOut = reservations.filter(
    (r) => r.status === "checked_out" && r.checked_out_at && inUtcDay(r.checked_out_at, now),
  ).length;

  const vipArrivalsToday = reservations.filter(
    (r) => r.vip_flag && inUtcDay(r.arrival_at, now) && r.status !== "cancelled",
  ).length;

  const unpreauthedRooms = reservations.filter(
    (r) =>
      r.status === "checked_in" &&
      (r.settlement_method === "card" || r.settlement_method === "partial_credit") &&
      r.preauth_amount == null &&
      !cardSecuredReservationIds.has(r.id),
  ).length;

  const occupancy: FrontDeskOccupancyStats = {
    totalRooms: rooms.length,
    occupiedRooms: inHouseCount,
    availableRooms: summaryCounts.available,
    reservedRooms: summaryCounts.reserved,
    maintenanceRooms: summaryCounts.maintenance + summaryCounts.dirty + summaryCounts.outOfService,
    occupancyPercent: rooms.length > 0 ? Math.round((inHouseCount / rooms.length) * 100) : 0,
    inHouseGuestHeadcount,
  };

  const kpiTiles = buildKpiTiles({
    arrivalsTodayTotal,
    arrivalsCheckedIn,
    departuresTodayTotal,
    departuresCheckedOut,
    inHouseGuests: inHouseGuestHeadcount,
    roomsReady,
    overdueCheckouts: summaryCounts.overdueCheckout,
    openRequests: 0,
    vipArrivalsToday,
    unpreauthedRooms,
  });

  const notifications: FrontDeskNotificationItem[] = (
    (notificationRows ?? []) as {
      id: string;
      type: string;
      title: string;
      body: string;
      severity: string;
      created_at: string;
      read_at: string | null;
    }[]
  ).map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    severity: (n.severity === "critical" || n.severity === "warning" ? n.severity : "info") as
      | "info"
      | "warning"
      | "critical",
    createdAt: n.created_at,
    read: Boolean(n.read_at),
  }));

  const unreadNotificationCount = notifications.filter((n) => !n.read).length;

  const shiftNotes: FrontDeskShiftNoteItem[] = (
    (shiftNoteRows ?? []) as {
      id: string;
      body: string;
      priority: string;
      author_user_id: string;
      shift_date: string;
      resolved_at: string | null;
      created_at: string;
    }[]
  ).map((n) => ({
    id: n.id,
    body: n.body,
    priority: n.priority,
    authorName: actorNameByUserId.get(n.author_user_id) ?? "Staff",
    shiftDate: n.shift_date,
    resolved: Boolean(n.resolved_at),
    createdAt: n.created_at,
  }));

  const auditFeed: FrontDeskAuditItem[] = (
    (auditRows ?? []) as {
      id: string;
      actor_user_id: string | null;
      action: string;
      entity_type: string;
      before_state: Record<string, unknown> | null;
      after_state: Record<string, unknown> | null;
      created_at: string;
    }[]
  ).map((log) => ({
    id: log.id,
    message: formatAuditMessage({
      actorName: log.actor_user_id
        ? (actorNameByUserId.get(log.actor_user_id) ?? "Staff")
        : "System",
      action: log.action,
      entityType: log.entity_type,
      before: log.before_state,
      after: log.after_state,
      createdAt: log.created_at,
    }),
    createdAt: log.created_at,
  }));

  const folioForRevenue = (folioRows ?? []).map((tx) => ({
    reservation_id: tx.reservation_id as string,
    kind: tx.kind as string,
    amount: tx.amount as string | number,
    voided_at: (tx.voided_at as string | null) ?? null,
    created_at: tx.created_at as string,
  }));

  const grossRevenueToday = getGrossRevenueForUtcDay(
    folioForRevenue,
    (fbOrderRows ?? []) as DashboardFbOrderRow[],
    now,
  );

  const dayStarts: string[] = [];
  const dayLabels: string[] = [];
  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(todayUtc.getTime() + i * 86400000);
    dayStarts.push(d.toISOString().slice(0, 10));
    dayLabels.push(
      d.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }),
    );
  }
  const weekStartMs = parseTs(`${dayStarts[0]}T00:00:00.000Z`);
  const weekEndMs = parseTs(`${dayStarts[6]}T23:59:59.999Z`);

  const calendarStays: CalendarWeekStay[] = [];
  for (const r of reservations) {
    if (r.status === "cancelled" || r.status === "no_show") continue;
    const a = parseTs(r.arrival_at);
    const dep = parseTs(r.departure_at);
    if (dep <= weekStartMs || a >= weekEndMs) continue;
    const guest = guestByReservation.get(r.id);
    const room = r.room_unit_id ? rooms.find((u) => u.id === r.room_unit_id) : null;
    calendarStays.push({
      reservationId: r.id,
      guestName: guest ? formatGuestDisplayName(guest) : "Guest",
      roomCode: room?.room_code ?? null,
      roomUnitId: r.room_unit_id,
      confirmationCode: r.confirmation_code,
      startDate: r.arrival_at,
      endDate: r.departure_at,
    });
  }

  const calendarWeek: FrontDeskCalendarWeek = {
    dayLabels,
    dayStarts,
    stays: calendarStays,
  };

  const analytics: FrontDeskAnalytics = {
    occupancyTrend: buildOccupancyTrend(reservations, rooms.length),
    dailyCheckIns: buildDailyMovementSeries(reservations, "checked_in_at"),
    dailyCheckOuts: buildDailyMovementSeries(reservations, "checked_out_at"),
    roomMix: {
      available:
        summaryCounts.available +
        summaryCounts.dirty +
        summaryCounts.maintenance +
        summaryCounts.outOfService,
      occupied: inHouseCount + summaryCounts.reserved,
    },
    revenueToday: formatPricingAmount(grossRevenueToday, currency),
    occupancyRate:
      rooms.length > 0 ? Math.min(100, Math.round((inHouseCount / rooms.length) * 100)) : 0,
    inHouseGuestHeadcount,
  };

  return {
    tenantId,
    summaryCounts,
    kpiTiles,
    occupancy,
    floors,
    roomsByFloor,
    arrivalsToday,
    departuresToday,
    expectedCheckoutsToday,
    pendingCheckInsToday,
    notifications,
    unreadNotificationCount,
    shiftNotes,
    auditFeed,
    calendarWeek,
    analytics,
    currency,
    reservationRecordCount: reservations.length,
  };
}

/**
 * Builds one {@link FrontDeskRoomBoardItem} without loading the full front desk board.
 * Used by room detail and other call sites that only need a single room’s operational context.
 */
export async function loadFrontDeskRoomBoardItemForUnit(params: {
  tenantId: string;
  unit: {
    id: string;
    room_code: string;
    floor: number;
    room_type_code: string;
    status: string;
    notes: string | null;
  };
  roomTypes: HotelRoomTypeSetup[];
}): Promise<FrontDeskRoomBoardItem> {
  const { tenantId, unit, roomTypes } = params;
  const supabase = createServerSupabaseClient();
  const roomTypeNameByCode = new Map(roomTypes.map((t) => [t.id, t.name]));
  const roomTypeGridAbbrevById = new Map(roomTypes.map((t) => [t.id, roomTypeGridAbbrev(t)]));

  const guestSelect =
    "id,title,first_name,last_name,nationality,id_type,id_number,id_expiry_date,date_of_birth,gender,phone,email,whatsapp,preferred_channel,tags";

  const { data: resRows, error: resError } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      `id,confirmation_code,status,arrival_at,departure_at,room_unit_id,room_type_code,checked_in_at,checked_out_at,settlement_method,preauth_amount,total_room_charges,rate_per_night,guest_remarks,folio_number,vip_flag,source,booking_channel,adults,children_json,reservation_guests(is_primary,relationship,guests(${guestSelect}))`,
    )
    .eq("tenant_id", tenantId)
    .eq("room_unit_id", unit.id);

  if (resError) {
    console.warn("[loadFrontDeskRoomBoardItemForUnit] reservation query failed:", resError);
  }

  type ReservationWithGuests = ReservationRow & {
    reservation_guests?: ReservationGuestEmbed[] | null;
  };

  const reservationsRaw = (resRows ?? []) as ReservationWithGuests[];
  const reservations: ReservationRow[] = reservationsRaw.map(
    ({ reservation_guests: _rg, ...row }) => row as ReservationRow,
  );

  const { primaryByReservation: guestByReservation, partyByReservation } =
    await resolveReservationGuests(supabase, tenantId, guestSelect, reservationsRaw);

  const reservationIds = reservations.map((r) => r.id);

  const [folioResult, flagResult, hkResult] = await Promise.all([
    reservationIds.length
      ? supabase
          .schema("hotel")
          .from("folio_transactions")
          .select("*")
          .eq("tenant_id", tenantId)
          .in("reservation_id", reservationIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .schema("hotel")
      .from("room_unit_flags")
      .select("room_unit_id,dnd,security_hold,staff_restricted")
      .eq("tenant_id", tenantId)
      .eq("room_unit_id", unit.id)
      .maybeSingle(),
    supabase
      .schema("hotel")
      .from("housekeeping_tasks")
      .select(
        "room_unit_id,status,started_at,completed_at,inspected_at,assigned_staff_id,priority_level,due_by",
      )
      .eq("tenant_id", tenantId)
      .eq("room_unit_id", unit.id)
      .neq("status", "ready")
      .maybeSingle(),
  ]);

  const folioLinesByReservation = new Map<string, FolioLineRow[]>();
  for (const tx of folioResult.data ?? []) {
    const row = mapFolioLineRow(tx as Record<string, unknown>);
    const list = folioLinesByReservation.get(row.reservation_id) ?? [];
    list.push(row);
    folioLinesByReservation.set(row.reservation_id, list);
  }

  let roomFlags: RoomUnitFlags = DEFAULT_ROOM_FLAGS;
  const flagRow = flagResult.data as {
    room_unit_id: string;
    dnd: boolean;
    security_hold: boolean;
    staff_restricted: boolean;
  } | null;
  if (flagRow) {
    roomFlags = {
      dnd: flagRow.dnd,
      securityHold: flagRow.security_hold,
      staffRestricted: flagRow.staff_restricted,
    };
  }

  const hkByRoom = new Map<string, HousekeepingTaskInfo>();
  const hkRow = hkResult.data as {
    room_unit_id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    inspected_at: string | null;
    assigned_staff_id: string | null;
    priority_level?: string;
    due_by?: string | null;
  } | null;
  if (hkRow) {
    hkByRoom.set(hkRow.room_unit_id, {
      status: hkRow.status,
      startedAt: hkRow.started_at,
      completedAt: hkRow.completed_at,
      inspectedAt: hkRow.inspected_at,
      assignedStaffId: hkRow.assigned_staff_id,
      priorityLevel: hkRow.priority_level,
      dueBy: hkRow.due_by,
    });
  }

  const now = new Date();
  let activeStay: ReservationRow | null = null;
  let reservedStay: ReservationRow | null = null;
  let lastCheckoutAt: string | null = null;

  for (const r of reservations) {
    if (r.status === "checked_in") {
      activeStay = r;
    } else if (r.status === "confirmed") {
      if (!reservedStay || parseTs(r.arrival_at) < parseTs(reservedStay.arrival_at)) {
        reservedStay = r;
      }
    }
    if (r.status === "checked_out" && r.checked_out_at) {
      if (!lastCheckoutAt || parseTs(r.checked_out_at) > parseTs(lastCheckoutAt)) {
        lastCheckoutAt = r.checked_out_at;
      }
    }
  }

  const displayStatus = resolveRoomDisplayStatus({
    unitStatus: unit.status,
    activeStay,
    reservedStay,
    now,
  });

  const guestForActive = activeStay ? guestByReservation.get(activeStay.id) : undefined;
  const guestForReserved = reservedStay ? guestByReservation.get(reservedStay.id) : undefined;

  const stayRow = activeStay ?? reservedStay;
  const paymentStatus = stayRow
    ? derivePaymentStatus(stayRow, folioLinesByReservation.get(stayRow.id) ?? [])
    : null;

  const metaName = roomTypeNameByCode.get(unit.room_type_code) ?? unit.room_type_code;

  return {
    id: unit.id,
    roomCode: unit.room_code,
    floor: unit.floor,
    roomTypeCode: unit.room_type_code,
    roomTypeName: metaName,
    roomTypeGridAbbrev:
      roomTypeGridAbbrevById.get(unit.room_type_code) ??
      (unit.room_type_code.length > 12 ? unit.room_type_code.slice(0, 4) : unit.room_type_code),
    unitStatus: unit.status,
    notes: unit.notes,
    displayStatus,
    statusLabel: FRONT_DESK_STATUS_LABELS[displayStatus],
    statusShortLabel: FRONT_DESK_STATUS_SHORT_LABELS[displayStatus],
    stay: activeStay
      ? buildStayInfo(
          activeStay,
          guestForActive,
          folioLinesByReservation.get(activeStay.id) ?? [],
          partyByReservation.get(activeStay.id) ?? [],
        )
      : null,
    reservedStay: reservedStay
      ? buildStayInfo(
          reservedStay,
          guestForReserved,
          folioLinesByReservation.get(reservedStay.id) ?? [],
          partyByReservation.get(reservedStay.id) ?? [],
        )
      : null,
    lastCheckoutAt,
    roomFlags,
    paymentStatus,
    housekeeping: hkByRoom.get(unit.id) ?? null,
  };
}

export function formatBoardDateTime(iso: string) {
  return formatDateTime(iso);
}
