import {
  bookingSourceLabel,
  derivePaymentStatus,
  formatGuestDisplayName,
  guestHasVipTag,
  toGuestInfo,
  type PaymentDisplayStatus,
} from "@/lib/hms/front-desk-board";
import { formatAuditMessage } from "@/lib/hms/front-desk-ops";
import { computeFolioBalance, getFolioForReservation, mapFolioLineRow, type FolioLineRow } from "@/lib/hms/folio";
import { mapRoomReadiness, type RoomUnitSnapshot } from "@/lib/hms/arrivals-room";
import { maybeEmitArrivalAlerts } from "@/lib/hms/arrivals-alerts";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ArrivalsDatePreset = "today" | "tomorrow" | "week" | "custom";

export type RoomReadinessStatus = "ready" | "dirty" | "cleaning" | "inspected" | "maintenance";

export type ArrivalsWorkbenchFilters = {
  status?: string[];
  payment?: PaymentDisplayStatus[];
  roomReadiness?: RoomReadinessStatus[];
  vipOnly?: boolean;
  source?: string[];
  q?: string;
};

export type ArrivalSummary = {
  totalArrivals: number;
  checkedIn: number;
  pending: number;
  vip: number;
  noShows: number;
  roomsReady: number;
};

export type ArrivalWorkbenchRow = {
  id: string;
  confirmationCode: string;
  bookingDate: string;
  bookingSourceLabel: string;
  source: string;
  guestId: string | null;
  guestName: string;
  phone: string;
  email: string;
  nationality: string;
  partySize: number;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  roomTypeCode: string;
  roomUnitId: string | null;
  roomCode: string | null;
  floor: number | null;
  totalCharges: number;
  amountPaid: number;
  outstandingBalance: number;
  paymentStatus: PaymentDisplayStatus;
  paymentLabel: string;
  status: string;
  roomReadiness: RoomReadinessStatus | null;
  isVip: boolean;
  specialRequestsPreview: string | null;
  openRequestCount: number;
  checkInProgress: "pending" | "checked_in" | "no_show" | "cancelled";
  folioNumber: string;
  highlight: "none" | "soon" | "overdue";
};

export type ArrivalsWorkbenchPayload = {
  rows: ArrivalWorkbenchRow[];
  summary: ArrivalSummary;
  currency: string;
  rangeLabel: string;
  startIso: string;
  endIso: string;
};

export type AssignableRoomOption = {
  id: string;
  roomCode: string;
  floor: number;
  roomTypeCode: string;
  unitStatus: string;
  readiness: RoomReadinessStatus;
};

export type ArrivalDetailPayload = {
  reservation: {
    id: string;
    confirmationCode: string;
    status: string;
    source: string;
    bookingChannel: string | null;
    bookingSourceLabel: string;
    createdAt: string;
    arrivalAt: string;
    departureAt: string;
    nights: number;
    adults: number;
    childrenCount: number;
    roomTypeCode: string;
    roomUnitId: string | null;
    roomCode: string | null;
    floor: number | null;
    roomReadiness: RoomReadinessStatus | null;
    unitStatus: string | null;
    settlementMethod: string;
    totalRoomCharges: number;
    guestRemarks: string | null;
    roomPreferencesText: string | null;
    vipNotes: string | null;
    dietaryNotes: string | null;
    accessibilityNotes: string | null;
    isVip: boolean;
    marketSegment: string;
    billToAccount: string | null;
    folioNumber: string;
  };
  guest: ReturnType<typeof toGuestInfo> | null;
  folio: {
    balance: number;
    charges: number;
    credits: number;
    displayStatus: PaymentDisplayStatus;
    lines: FolioLineRow[];
    balanceFormatted: string;
  };
  auditTimeline: { id: string; message: string; createdAt: string }[];
  activityTimeline: { id: string; message: string; createdAt: string }[];
  assignableRooms: AssignableRoomOption[];
};

function parseTs(value: string) {
  return new Date(value).getTime();
}

function num(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}

function countChildren(raw: unknown): number {
  return Array.isArray(raw) ? raw.length : 0;
}

export function resolveArrivalsDateRange(
  preset: ArrivalsDatePreset,
  reference = new Date(),
  customStart?: string,
  customEnd?: string,
): { startIso: string; endIso: string; label: string } {
  const y = reference.getUTCFullYear();
  const m = reference.getUTCMonth();
  const d = reference.getUTCDate();

  if (preset === "custom" && customStart && customEnd) {
    const start = new Date(`${customStart}T00:00:00.000Z`);
    const end = new Date(`${customEnd}T00:00:00.000Z`);
    end.setUTCDate(end.getUTCDate() + 1);
    return {
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      label: `${customStart} – ${customEnd}`,
    };
  }

  if (preset === "tomorrow") {
    const start = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, d + 2, 0, 0, 0, 0));
    return { startIso: start.toISOString(), endIso: end.toISOString(), label: "Tomorrow" };
  }

  if (preset === "week") {
    const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
    const end = new Date(Date.UTC(y, m, d + 7, 0, 0, 0, 0));
    return { startIso: start.toISOString(), endIso: end.toISOString(), label: "This week" };
  }

  const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, d + 1, 0, 0, 0, 0));
  return { startIso: start.toISOString(), endIso: end.toISOString(), label: "Today" };
}

function movementHighlight(arrivalAt: string, now: Date): "none" | "soon" | "overdue" {
  const t = parseTs(arrivalAt);
  const diff = t - now.getTime();
  if (diff < 0) return "overdue";
  if (diff <= 60 * 60 * 1000) return "soon";
  return "none";
}

type ReservationRow = {
  id: string;
  confirmation_code: string;
  status: string;
  created_at: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  children_json: unknown;
  room_unit_id: string | null;
  room_type_code: string;
  settlement_method: string;
  preauth_amount: string | number | null;
  total_room_charges: string | number;
  guest_remarks: string | null;
  room_preferences_text: string | null;
  vip_notes: string | null;
  dietary_notes: string | null;
  accessibility_notes: string | null;
  vip_flag: boolean;
  source: string;
  booking_channel: string | null;
  folio_number: string;
  market_segment: string;
  bill_to_account: string | null;
  checked_in_at: string | null;
  reservation_guests: {
    is_primary: boolean;
    guests: GuestEmbed | GuestEmbed[] | null;
  }[] | null;
};

type GuestEmbed = {
  id: string;
  title: string | null;
  first_name: string;
  last_name: string;
  nationality: string;
  phone: string;
  email: string;
  id_number?: string;
  tags?: unknown;
};

function primaryGuest(reservation: ReservationRow): GuestEmbed | null {
  const links = reservation.reservation_guests ?? [];
  const primary = links.find((l) => l.is_primary) ?? links[0];
  if (!primary?.guests) return null;
  const g = primary.guests;
  return Array.isArray(g) ? g[0] ?? null : g;
}

function paymentLabel(status: PaymentDisplayStatus) {
  const map: Record<PaymentDisplayStatus, string> = {
    paid: "Paid",
    partial: "Partial",
    unpaid: "Unpaid",
    refund_pending: "Refund pending",
    unknown: "Unknown",
  };
  return map[status];
}

function checkInProgress(status: string): ArrivalWorkbenchRow["checkInProgress"] {
  if (status === "checked_in") return "checked_in";
  if (status === "no_show") return "no_show";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

function matchesSearch(row: ArrivalWorkbenchRow, q: string, guest?: GuestEmbed | null): boolean {
  const needle = q.toLowerCase();
  if (row.confirmationCode.toLowerCase().includes(needle)) return true;
  if (row.guestName.toLowerCase().includes(needle)) return true;
  if (row.phone.toLowerCase().includes(needle)) return true;
  if (row.email.toLowerCase().includes(needle)) return true;
  if (row.roomCode?.toLowerCase().includes(needle)) return true;
  if (row.bookingSourceLabel.toLowerCase().includes(needle)) return true;
  if (row.source.toLowerCase().includes(needle)) return true;
  if (guest?.id_number?.toLowerCase().includes(needle)) return true;
  return false;
}

function applyFilters(
  rows: ArrivalWorkbenchRow[],
  filters: ArrivalsWorkbenchFilters | undefined,
  guestByReservation: Map<string, GuestEmbed | null>,
): ArrivalWorkbenchRow[] {
  let out = rows;
  if (filters?.status?.length) {
    const set = new Set(filters.status);
    out = out.filter((r) => set.has(r.status));
  }
  if (filters?.payment?.length) {
    const set = new Set(filters.payment);
    out = out.filter((r) => set.has(r.paymentStatus));
  }
  if (filters?.roomReadiness?.length) {
    const set = new Set(filters.roomReadiness);
    out = out.filter((r) => r.roomReadiness && set.has(r.roomReadiness));
  }
  if (filters?.vipOnly) out = out.filter((r) => r.isVip);
  if (filters?.source?.length) {
    const set = new Set(filters.source);
    out = out.filter((r) => set.has(r.source));
  }
  if (filters?.q?.trim()) {
    const q = filters.q.trim();
    out = out.filter((r) => matchesSearch(r, q, guestByReservation.get(r.id) ?? null));
  }
  return out;
}

export async function getArrivalsWorkbenchData(params: {
  tenantId: string;
  currency: string;
  preset?: ArrivalsDatePreset;
  customStart?: string;
  customEnd?: string;
  filters?: ArrivalsWorkbenchFilters;
}): Promise<ArrivalsWorkbenchPayload> {
  const preset = params.preset ?? "today";
  const { startIso, endIso, label } = resolveArrivalsDateRange(
    preset,
    new Date(),
    params.customStart,
    params.customEnd,
  );
  const supabase = createServerSupabaseClient();
  const now = new Date();

  const guestSelect =
    "id,title,first_name,last_name,nationality,phone,email,id_number,tags";

  const [
    { data: resRows },
    { data: roomRows },
    { data: hkRows },
    { data: folioRows },
  ] = await Promise.all([
    supabase
      .schema("hotel")
      .from("reservations")
      .select(
        `id,confirmation_code,status,created_at,arrival_at,departure_at,nights,adults,children_json,room_unit_id,room_type_code,settlement_method,preauth_amount,total_room_charges,guest_remarks,room_preferences_text,vip_notes,dietary_notes,accessibility_notes,vip_flag,source,booking_channel,folio_number,market_segment,bill_to_account,checked_in_at,reservation_guests(is_primary,guests(${guestSelect}))`,
      )
      .eq("tenant_id", params.tenantId)
      .gte("arrival_at", startIso)
      .lt("arrival_at", endIso)
      .order("arrival_at", { ascending: true }),
    supabase
      .schema("hotel")
      .from("room_units")
      .select("id,room_code,floor,room_type_code,status")
      .eq("tenant_id", params.tenantId),
    supabase
      .schema("hotel")
      .from("housekeeping_tasks")
      .select("room_unit_id,status")
      .eq("tenant_id", params.tenantId),
    supabase.schema("hotel").from("folio_transactions").select("*").eq("tenant_id", params.tenantId),
  ]);

  const openRequestCountByReservation = new Map<string, number>();
  const { data: openRequests, error: openReqErr } = await supabase
    .schema("hotel")
    .from("guest_requests")
    .select("reservation_id")
    .eq("tenant_id", params.tenantId)
    .in("status", ["pending", "assigned", "in_progress", "waiting", "escalated"]);
  if (!openReqErr) {
    for (const req of openRequests ?? []) {
      const id = req.reservation_id;
      openRequestCountByReservation.set(id, (openRequestCountByReservation.get(id) ?? 0) + 1);
    }
  }

  const rooms = roomRows ?? [];
  const roomById = new Map(rooms.map((u) => [u.id, u]));
  const hkByRoom = new Map((hkRows ?? []).map((h) => [h.room_unit_id, h.status as string]));

  const folioByReservation = new Map<string, FolioLineRow[]>();
  for (const row of folioRows ?? []) {
    const line = mapFolioLineRow(row as Record<string, unknown>);
    const list = folioByReservation.get(line.reservation_id) ?? [];
    list.push(line);
    folioByReservation.set(line.reservation_id, list);
  }

  const guestByReservation = new Map<string, GuestEmbed | null>();
  const rawRows: ArrivalWorkbenchRow[] = [];

  for (const r of (resRows ?? []) as ReservationRow[]) {
    const guest = primaryGuest(r);
    guestByReservation.set(r.id, guest);
    const room = r.room_unit_id ? roomById.get(r.room_unit_id) : null;
    const hkStatus = r.room_unit_id ? hkByRoom.get(r.room_unit_id) : null;
    const lines = folioByReservation.get(r.id) ?? [];
    const folioBal = computeFolioBalance(lines, {
      settlementMethod: r.settlement_method,
      preauthAmount: r.preauth_amount != null ? num(r.preauth_amount) : null,
      totalRoomCharges: num(r.total_room_charges),
      status: r.status,
    });
    const paymentStatus = derivePaymentStatus(r, lines);
    const prefs = [r.room_preferences_text, r.guest_remarks].filter(Boolean).join(" · ") || null;

    rawRows.push({
      id: r.id,
      confirmationCode: r.confirmation_code,
      bookingDate: r.created_at,
      bookingSourceLabel: bookingSourceLabel(r),
      source: r.source,
      guestId: guest?.id ?? null,
      guestName: guest ? formatGuestDisplayName(guest as Parameters<typeof formatGuestDisplayName>[0]) : "Guest not linked",
      phone: guest?.phone ?? "—",
      email: guest?.email ?? "—",
      nationality: guest?.nationality ?? "—",
      partySize: r.adults + countChildren(r.children_json),
      arrivalAt: r.arrival_at,
      departureAt: r.departure_at,
      nights: r.nights,
      roomTypeCode: r.room_type_code,
      roomUnitId: r.room_unit_id,
      roomCode: room?.room_code ?? null,
      floor: room?.floor ?? null,
      totalCharges: num(r.total_room_charges),
      amountPaid: folioBal.credits,
      outstandingBalance: Math.max(0, folioBal.balance),
      paymentStatus,
      paymentLabel: paymentLabel(paymentStatus),
      status: r.status,
      roomReadiness: room
        ? mapRoomReadiness(room.status, hkStatus)
        : null,
      isVip: r.vip_flag || guestHasVipTag(guest ?? undefined),
      specialRequestsPreview: prefs,
      openRequestCount: openRequestCountByReservation.get(r.id) ?? 0,
      checkInProgress: checkInProgress(r.status),
      folioNumber: r.folio_number,
      highlight: r.status === "confirmed" ? movementHighlight(r.arrival_at, now) : "none",
    });
  }

  const rows = applyFilters(rawRows, params.filters, guestByReservation);

  const roomsReady = rooms.filter((u) =>
    ["vacant_clean", "inspected", "ready_for_occupancy"].includes(u.status),
  ).length;

  const summary: ArrivalSummary = {
    totalArrivals: rawRows.filter((r) => r.status !== "cancelled").length,
    checkedIn: rawRows.filter((r) => r.status === "checked_in").length,
    pending: rawRows.filter((r) => r.status === "confirmed").length,
    vip: rawRows.filter((r) => r.isVip && r.status !== "cancelled").length,
    noShows: rawRows.filter((r) => r.status === "no_show").length,
    roomsReady,
  };

  return {
    rows,
    summary,
    currency: params.currency,
    rangeLabel: label,
    startIso,
    endIso,
  };
}

export async function getArrivalDetail(params: {
  tenantId: string;
  reservationId: string;
  currency: string;
}): Promise<ArrivalDetailPayload | null> {
  const supabase = createServerSupabaseClient();
  const guestSelect =
    "id,title,first_name,last_name,nationality,id_type,id_number,id_expiry_date,date_of_birth,gender,phone,email,whatsapp,preferred_channel,tags";

  const { data: r, error } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      `id,confirmation_code,status,created_at,arrival_at,departure_at,nights,adults,children_json,room_unit_id,room_type_code,settlement_method,preauth_amount,total_room_charges,guest_remarks,room_preferences_text,vip_notes,dietary_notes,accessibility_notes,vip_flag,source,booking_channel,folio_number,market_segment,bill_to_account,reservation_guests(is_primary,guests(${guestSelect}))`,
    )
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();

  if (error || !r) return null;

  const reservation = r as unknown as ReservationRow;
  const guestEmbed = primaryGuest(reservation);

  let room: { room_code: string; floor: number; status: string; room_type_code: string } | null =
    null;
  if (reservation.room_unit_id) {
    const { data: unit } = await supabase
      .schema("hotel")
      .from("room_units")
      .select("room_code,floor,status,room_type_code")
      .eq("id", reservation.room_unit_id)
      .maybeSingle();
    room = unit;
  }

  const { data: hk } = reservation.room_unit_id
    ? await supabase
        .schema("hotel")
        .from("housekeeping_tasks")
        .select("status")
        .eq("tenant_id", params.tenantId)
        .eq("room_unit_id", reservation.room_unit_id)
        .maybeSingle()
    : { data: null };

  const folio = await getFolioForReservation(supabase, params.tenantId, params.reservationId, {
    settlementMethod: reservation.settlement_method,
    preauthAmount:
      reservation.preauth_amount != null ? num(reservation.preauth_amount) : null,
    totalRoomCharges: num(reservation.total_room_charges),
    status: reservation.status,
  });

  const { data: auditRows } = await supabase
    .schema("hotel")
    .from("audit_logs")
    .select("id,actor_user_id,action,entity_type,entity_id,before_state,after_state,created_at")
    .eq("tenant_id", params.tenantId)
    .eq("entity_id", params.reservationId)
    .order("created_at", { ascending: false })
    .limit(40);

  const { data: profiles } = await supabase
    .schema("hotel")
    .from("profiles")
    .select("user_id,contact_name")
    .eq("tenant_id", params.tenantId);

  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id, p.contact_name ?? "Staff"]));

  const auditTimeline = (auditRows ?? [])
    .filter((a) => a.entity_id === params.reservationId || a.entity_type === "reservation")
    .map((a) => ({
      id: a.id,
      message: formatAuditMessage({
        actorName: a.actor_user_id ? nameByUser.get(a.actor_user_id) ?? "Staff" : "System",
        action: a.action,
        entityType: a.entity_type,
        before: a.before_state as Record<string, unknown> | null,
        after: a.after_state as Record<string, unknown> | null,
        createdAt: a.created_at,
      }),
      createdAt: a.created_at,
    }));

  const { data: allRooms } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,floor,room_type_code,status")
    .eq("tenant_id", params.tenantId)
    .neq("status", "out_of_order")
    .order("room_code");

  const { data: occupied } = await supabase
    .schema("hotel")
    .from("reservations")
    .select("room_unit_id")
    .eq("tenant_id", params.tenantId)
    .eq("status", "checked_in");

  const occupiedIds = new Set((occupied ?? []).map((o) => o.room_unit_id).filter(Boolean));

  const { data: allHk } = await supabase
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("room_unit_id,status")
    .eq("tenant_id", params.tenantId);

  const hkMap = new Map((allHk ?? []).map((h) => [h.room_unit_id, h.status as string]));

  const assignableRooms: AssignableRoomOption[] = (allRooms ?? [])
    .filter((u) => !occupiedIds.has(u.id) || u.id === reservation.room_unit_id)
    .filter(
      (u) =>
        u.room_type_code === reservation.room_type_code || u.id === reservation.room_unit_id,
    )
    .map((u) => ({
      id: u.id,
      roomCode: u.room_code,
      floor: u.floor,
      roomTypeCode: u.room_type_code,
      unitStatus: u.status,
      readiness: mapRoomReadiness(u.status, hkMap.get(u.id)),
    }));

  const guest = guestEmbed
    ? toGuestInfo(guestEmbed as Parameters<typeof toGuestInfo>[0])
    : null;

  const folioActivity = folio.lines
    .filter((l) => !l.voided_at)
    .map((l) => ({
      id: `folio-${l.id}`,
      message: `Folio ${l.kind}: ${l.description ?? l.method} (${formatPricingAmount(l.amount, params.currency)})`,
      createdAt: l.created_at,
    }));

  const activityTimeline = [...auditTimeline, ...folioActivity].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt),
  );

  const guestName = guest?.displayName ?? "Guest";

  void maybeEmitArrivalAlerts({
    supabase,
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    guestName,
    confirmationCode: reservation.confirmation_code,
    status: reservation.status,
    arrivalAt: reservation.arrival_at,
    roomCode: room?.room_code ?? null,
    roomReadiness: room
      ? mapRoomReadiness(room.status, hk?.status as string | undefined)
      : null,
    paymentStatus: folio.displayStatus,
    balance: folio.balance,
    currency: params.currency,
  });

  return {
    reservation: {
      id: reservation.id,
      confirmationCode: reservation.confirmation_code,
      status: reservation.status,
      source: reservation.source,
      bookingChannel: reservation.booking_channel,
      bookingSourceLabel: bookingSourceLabel(reservation),
      createdAt: reservation.created_at,
      arrivalAt: reservation.arrival_at,
      departureAt: reservation.departure_at,
      nights: reservation.nights,
      adults: reservation.adults,
      childrenCount: countChildren(reservation.children_json),
      roomTypeCode: reservation.room_type_code,
      roomUnitId: reservation.room_unit_id,
      roomCode: room?.room_code ?? null,
      floor: room?.floor ?? null,
      roomReadiness: room
        ? mapRoomReadiness(room.status, hk?.status as string | undefined)
        : null,
      unitStatus: room?.status ?? null,
      settlementMethod: reservation.settlement_method,
      totalRoomCharges: num(reservation.total_room_charges),
      guestRemarks: reservation.guest_remarks,
      roomPreferencesText: reservation.room_preferences_text,
      vipNotes: reservation.vip_notes,
      dietaryNotes: reservation.dietary_notes,
      accessibilityNotes: reservation.accessibility_notes,
      isVip: reservation.vip_flag || guestHasVipTag(guestEmbed ?? undefined),
      marketSegment: reservation.market_segment,
      billToAccount: reservation.bill_to_account,
      folioNumber: reservation.folio_number,
    },
    guest,
    folio: {
      balance: folio.balance,
      charges: folio.charges,
      credits: folio.credits,
      displayStatus: folio.displayStatus,
      lines: folio.lines,
      balanceFormatted: formatPricingAmount(folio.balance, params.currency),
    },
    auditTimeline,
    activityTimeline,
    assignableRooms,
  };
}

export function listAssignableRoomsForType(
  rooms: RoomUnitSnapshot[],
  hkByRoom: Map<string, string>,
  roomTypeCode: string,
  occupiedIds: Set<string>,
  currentRoomId?: string | null,
): AssignableRoomOption[] {
  return rooms
    .filter((u) => u.room_type_code === roomTypeCode || u.id === currentRoomId)
    .filter((u) => !occupiedIds.has(u.id) || u.id === currentRoomId)
    .map((u) => ({
      id: u.id,
      roomCode: u.room_code,
      floor: u.floor,
      roomTypeCode: u.room_type_code,
      unitStatus: u.status,
      readiness: mapRoomReadiness(u.status, hkByRoom.get(u.id)),
    }));
}
