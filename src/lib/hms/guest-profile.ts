import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  guestHasDoNotWalkTag,
  guestHasVipTag,
  toGuestInfo,
  type FrontDeskGuestInfo,
} from "@/lib/hms/front-desk-board";
import { computeFolioBalance, mapFolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { listGuestNotes, type GuestNoteRow } from "@/lib/hms/guest-management";
import { emptyMetrics, foldGuestMetrics, loadBilled, type GuestMetrics, type StayBilled, type StayInput } from "@/lib/hms/guest-metrics";
import type { GuestEditable } from "@/lib/hms/guest-fields";

export type GuestStayRow = {
  id: string;
  confirmationCode: string;
  status: string;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  roomTypeCode: string;
  roomCode: string | null;
  channel: string | null;
  /** The room price booked. */
  totalCharges: number;
  /** What the bill came to (charges less discounts); null when there is no bill or this guest is not the one paying. */
  billed: StayBilled | null;
  isPrimary: boolean;
};

export type GuestServiceRequestSummary = {
  id: string;
  requestType: string;
  serviceCategory: string;
  status: string;
  priority: string;
  createdAt: string;
  confirmationCode: string | null;
};

export type GuestProfileData = {
  guest: FrontDeskGuestInfo;
  guestId: string;
  isVip: boolean;
  isDoNotWalk: boolean;
  /** Stays they have checked out of. */
  visitCount: number;
  /** What they have been billed over all their stays. */
  totalRevenue: number;
  openBalance: number;
  metrics: GuestMetrics;
  stays: GuestStayRow[];
  preferences: string | null;
  currency: string;
  serviceRequests: GuestServiceRequestSummary[];
  notes: GuestNoteRow[];
  editable: GuestEditable;
  address: { address: string | null; city: string | null; country: string | null };
  language: string | null;
  companyId: string | null;
  companyName: string | null;
  anonymised: boolean;
};

const BASE_SELECT =
  "id,title,first_name,last_name,nationality,id_type,id_number,id_expiry_date,date_of_birth,gender,phone,email,whatsapp,preferred_channel,tags";
const EXTRA_SELECT = `${BASE_SELECT},address,city,country,language,preferences,company_id,anonymised_at`;

/** The guest row. If the profile columns haven't been added to the database yet, falls back to the old ones. */
export async function fetchGuestRow(tenantId: string, guestId: string): Promise<Record<string, unknown> | null> {
  const supabase = createServerSupabaseClient();
  const tryOnce = (select: string) =>
    supabase.schema("hotel").from("guests").select(select).eq("tenant_id", tenantId).eq("id", guestId).maybeSingle();
  const first = await tryOnce(EXTRA_SELECT);
  if (!first.error) return (first.data as unknown as Record<string, unknown> | null) ?? null;
  const second = await tryOnce(BASE_SELECT);
  return (second.data as unknown as Record<string, unknown> | null) ?? null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export function toEditable(row: Record<string, unknown>): GuestEditable {
  return {
    title: str(row.title),
    firstName: str(row.first_name),
    lastName: str(row.last_name),
    nationality: str(row.nationality).trim(),
    idType: (str(row.id_type) || "national_id") as GuestEditable["idType"],
    idNumber: str(row.id_number),
    idExpiryDate: str(row.id_expiry_date).slice(0, 10),
    dateOfBirth: str(row.date_of_birth).slice(0, 10),
    gender: str(row.gender) || "unspecified",
    phone: str(row.phone),
    email: str(row.email),
    whatsapp: str(row.whatsapp),
    preferredChannel: (str(row.preferred_channel) || "email") as GuestEditable["preferredChannel"],
    address: str(row.address),
    city: str(row.city),
    country: str(row.country),
    language: str(row.language),
    preferences: str(row.preferences),
    companyId: str(row.company_id),
  };
}

export async function getGuestProfileData(params: {
  tenantId: string;
  guestId: string;
  currency: string;
}): Promise<GuestProfileData | null> {
  const { tenantId, guestId, currency } = params;
  const supabase = createServerSupabaseClient();

  const guestRow = await fetchGuestRow(tenantId, guestId);
  if (!guestRow) return null;

  let companyName: string | null = null;
  const companyId = (guestRow.company_id as string | null | undefined) ?? null;
  if (companyId) {
    const { data: company } = await supabase.schema("hotel").from("ar_customers").select("name").eq("tenant_id", tenantId).eq("id", companyId).maybeSingle();
    companyName = (company?.name as string | undefined) ?? null;
  }

  const common = {
    guest: toGuestInfo(guestRow as Parameters<typeof toGuestInfo>[0]),
    guestId,
    isVip: guestHasVipTag(guestRow as Parameters<typeof guestHasVipTag>[0]),
    isDoNotWalk: guestHasDoNotWalkTag(guestRow as Parameters<typeof guestHasDoNotWalkTag>[0]),
    currency,
    editable: toEditable(guestRow),
    address: {
      address: (guestRow.address as string | null | undefined) ?? null,
      city: (guestRow.city as string | null | undefined) ?? null,
      country: (guestRow.country as string | null | undefined) ?? null,
    },
    language: (guestRow.language as string | null | undefined) ?? null,
    companyId,
    companyName,
    anonymised: Boolean(guestRow.anonymised_at),
  };

  const { data: links } = await supabase
    .schema("hotel")
    .from("reservation_guests")
    .select("reservation_id,is_primary")
    .eq("guest_id", guestId);

  const reservationIds = (links ?? []).map((l) => l.reservation_id as string);
  const primaryByReservation = new Map((links ?? []).map((l) => [l.reservation_id as string, Boolean(l.is_primary)]));
  const savedPreferences = (guestRow.preferences as string | null | undefined) ?? null;

  if (reservationIds.length === 0) {
    return {
      ...common,
      visitCount: 0,
      totalRevenue: 0,
      openBalance: 0,
      metrics: foldGuestMetrics([], new Map()).get(guestId) ?? emptyMetrics(guestId),
      stays: [],
      preferences: savedPreferences,
      serviceRequests: [],
      notes: await listGuestNotes(supabase, tenantId, guestId),
    };
  }

  const { data: reservations } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,status,arrival_at,departure_at,nights,room_type_code,source,booking_channel,vip_flag,total_room_charges,settlement_method,preauth_amount,room_unit_id,room_preferences_text,guest_remarks",
    )
    .in("id", reservationIds)
    .order("arrival_at", { ascending: false });

  const roomIds = [
    ...new Set(
      (reservations ?? [])
        .map((r) => r.room_unit_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const roomCodeById = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: units } = await supabase
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .in("id", roomIds);
    for (const u of units ?? []) {
      roomCodeById.set(u.id, u.room_code);
    }
  }

  const countedIds = (reservations ?? []).filter((r) => r.status === "checked_in" || r.status === "checked_out").map((r) => r.id as string);
  const billed = await loadBilled(supabase, tenantId, countedIds);

  const stayInputs: StayInput[] = (reservations ?? []).map((r) => ({
    id: r.id as string,
    status: r.status as string,
    arrivalAt: r.arrival_at as string,
    departureAt: r.departure_at as string,
    nights: Number(r.nights) || 0,
    roomTypeCode: r.room_type_code as string,
    totalRoomCharges: Number(r.total_room_charges) || 0,
    vipFlag: Boolean(r.vip_flag),
    source: (r.source as string | null) ?? null,
    guests: [{ guestId, isPrimary: primaryByReservation.get(r.id as string) ?? false }],
  }));
  const metrics = foldGuestMetrics(stayInputs, billed).get(guestId) ?? emptyMetrics(guestId);

  const stays: GuestStayRow[] = (reservations ?? []).map((r) => {
    const isPrimary = primaryByReservation.get(r.id as string) ?? false;
    return {
      id: r.id as string,
      confirmationCode: r.confirmation_code as string,
      status: r.status as string,
      arrivalAt: r.arrival_at as string,
      departureAt: r.departure_at as string,
      nights: Number(r.nights) || 0,
      roomTypeCode: r.room_type_code as string,
      roomCode: r.room_unit_id ? (roomCodeById.get(r.room_unit_id) ?? null) : null,
      channel: ((r.booking_channel as string | null) || (r.source as string | null)) ?? null,
      totalCharges: Number(r.total_room_charges) || 0,
      billed: isPrimary ? (billed.get(r.id as string) ?? null) : null,
      isPrimary,
    };
  });

  const inHouseIds = (reservations ?? [])
    .filter((r) => r.status === "checked_in")
    .map((r) => r.id);
  let openBalance = 0;
  if (inHouseIds.length > 0) {
    const { data: folioRows } = await supabase
      .schema("hotel")
      .from("folio_transactions")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("reservation_id", inHouseIds);
    const byRes = new Map<string, ReturnType<typeof mapFolioLineRow>[]>();
    for (const row of folioRows ?? []) {
      const line = mapFolioLineRow(row as Record<string, unknown>);
      const list = byRes.get(line.reservation_id) ?? [];
      list.push(line);
      byRes.set(line.reservation_id, list);
    }
    for (const resId of inHouseIds) {
      const res = reservations?.find((r) => r.id === resId);
      const lines = byRes.get(resId) ?? [];
      const { balance } = computeFolioBalance(
        lines,
        res
          ? {
              settlementMethod: res.settlement_method as string,
              preauthAmount:
                res.preauth_amount != null ? Number(res.preauth_amount) : null,
              totalRoomCharges: Number(res.total_room_charges),
              status: res.status,
            }
          : undefined,
      );
      openBalance += Math.max(0, balance);
    }
  }

  const latest = reservations?.[0];
  const preferences =
    savedPreferences ??
    (latest?.room_preferences_text as string | null) ??
    (latest?.guest_remarks as string | null) ??
    null;

  const { data: guestSvcRows } = await supabase
    .schema("hotel")
    .from("guest_requests")
    .select("id,request_type,service_category,status,priority,created_at,reservation_id")
    .eq("tenant_id", tenantId)
    .in("reservation_id", reservationIds)
    .order("created_at", { ascending: false })
    .limit(50);

  const confByRes = new Map((reservations ?? []).map((r) => [r.id as string, r.confirmation_code as string]));
  const serviceRequests = (guestSvcRows ?? []).map((row) => ({
    id: row.id as string,
    requestType: row.request_type as string,
    serviceCategory: (row.service_category as string) ?? "other",
    status: row.status as string,
    priority: (row.priority as string) ?? "normal",
    createdAt: row.created_at as string,
    confirmationCode: confByRes.get(row.reservation_id as string) ?? null,
  }));

  return {
    ...common,
    visitCount: metrics.completedStays,
    totalRevenue: metrics.spend,
    openBalance,
    metrics,
    stays,
    preferences,
    serviceRequests,
    notes: await listGuestNotes(supabase, tenantId, guestId),
  };
}

export function formatGuestProfileRevenue(amount: number, currency: string) {
  return formatPricingAmount(amount, currency);
}
