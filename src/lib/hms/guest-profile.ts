import { createServerSupabaseClient } from "@/lib/supabase/server";
import { formatGuestDisplayName, toGuestInfo, type FrontDeskGuestInfo } from "@/lib/hms/front-desk-board";
import { computeFolioBalance, mapFolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

export type GuestStayRow = {
  id: string;
  confirmationCode: string;
  status: string;
  arrivalAt: string;
  departureAt: string;
  roomCode: string | null;
  totalCharges: number;
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
  visitCount: number;
  totalRevenue: number;
  openBalance: number;
  stays: GuestStayRow[];
  preferences: string | null;
  currency: string;
  serviceRequests: GuestServiceRequestSummary[];
};

export async function getGuestProfileData(params: {
  tenantId: string;
  guestId: string;
  currency: string;
}): Promise<GuestProfileData | null> {
  const { tenantId, guestId, currency } = params;
  const supabase = createServerSupabaseClient();

  const guestSelect =
    "id,title,first_name,last_name,nationality,id_type,id_number,id_expiry_date,date_of_birth,gender,phone,email,whatsapp,preferred_channel,tags";

  const { data: guestRow, error: guestError } = await supabase
    .schema("hotel")
    .from("guests")
    .select(guestSelect)
    .eq("tenant_id", tenantId)
    .eq("id", guestId)
    .maybeSingle();

  if (guestError || !guestRow) return null;

  const { data: links } = await supabase
    .schema("hotel")
    .from("reservation_guests")
    .select("reservation_id")
    .eq("guest_id", guestId);

  const reservationIds = (links ?? []).map((l) => l.reservation_id);
  if (reservationIds.length === 0) {
    return {
      guest: toGuestInfo(guestRow as Parameters<typeof toGuestInfo>[0]),
      guestId,
      visitCount: 0,
      totalRevenue: 0,
      openBalance: 0,
      stays: [],
      preferences: null,
      currency,
      serviceRequests: [],
    };
  }

  const { data: reservations } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      "id,confirmation_code,status,arrival_at,departure_at,total_room_charges,settlement_method,preauth_amount,room_unit_id,room_preferences_text,guest_remarks",
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

  const stays: GuestStayRow[] = (reservations ?? []).map((r) => ({
    id: r.id,
    confirmationCode: r.confirmation_code,
    status: r.status,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    roomCode: r.room_unit_id ? (roomCodeById.get(r.room_unit_id) ?? null) : null,
    totalCharges: Number(r.total_room_charges) || 0,
  }));

  const completed = stays.filter((s) => s.status === "checked_out").length;
  const totalRevenue = stays
    .filter((s) => s.status === "checked_out" || s.status === "checked_in")
    .reduce((sum, s) => sum + s.totalCharges, 0);

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
    guest: toGuestInfo(guestRow as Parameters<typeof toGuestInfo>[0]),
    guestId,
    visitCount: completed,
    totalRevenue,
    openBalance,
    stays,
    preferences,
    currency,
    serviceRequests,
  };
}

export function formatGuestProfileRevenue(amount: number, currency: string) {
  return formatPricingAmount(amount, currency);
}
