import type { SupabaseClient } from "@supabase/supabase-js";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";
import {
  clampStayOccupancy,
  maxOccupancyByRoomTypeId,
  resolveMaxOccupancy,
  stayHeadcount,
} from "./clamp-stay-occupancy";
import { buildStayChildrenJson, resolveStayGuests } from "./expand-stay-guests";
import { resolveFixtureDate, resolveFixtureDateOnly } from "./resolve-fixture-date";
import type {
  GuestProfileSample,
  GuestStaysSampleFile,
} from "./samples/guest-stays-sample.types";

const FIXTURE_NS = "f1000001-0000-4000-8000";

function fixtureUuid(kind: "guest" | "reservation" | "res_guest" | "group" | "folio", key: number) {
  const prefix =
    kind === "guest"
      ? "0001"
      : kind === "reservation"
        ? "0002"
        : kind === "res_guest"
          ? "0003"
          : kind === "group"
            ? "0004"
            : "0005";
  return `${FIXTURE_NS.slice(0, 8)}-${prefix}-4000-8000-${String(key).padStart(12, "0")}`;
}

function stayKey(ref: string): number {
  const n = Number(ref.replace(/\D/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid stay ref: ${ref}`);
  return n;
}

async function upsertBatch(supabase: SupabaseClient, table: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const { error } = await supabase.schema("hotel").from(table).upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

function buildGuestRow(tenantId: string, profile: GuestProfileSample, key: number, now: Date) {
  const id = fixtureUuid("guest", key);
  return {
    id,
    tenant_id: tenantId,
    title: profile.title ?? null,
    first_name: profile.first_name,
    last_name: profile.last_name,
    nationality: profile.nationality.toUpperCase().slice(0, 2),
    id_type: profile.id_type ?? "passport",
    id_number: profile.id_number,
    id_expiry_date: resolveFixtureDateOnly(profile.id_expiry_date, now),
    date_of_birth: resolveFixtureDateOnly(profile.date_of_birth, now),
    gender: profile.gender ?? null,
    id_document_storage_path: null,
    phone: profile.phone,
    email: profile.email,
    whatsapp: profile.whatsapp ?? null,
    preferred_channel: profile.preferred_channel ?? "email",
    tags: profile.tags ?? [],
    created_at: now.toISOString(),
  };
}

export type SeedGuestStaysResult =
  | { ok: true; message: string; counts: { guests: number; reservations: number; folio: number } }
  | { ok: false; error: string };

export async function seedGuestStaysFromFixture(
  supabase: SupabaseClient,
  tenantId: string,
  slug: string,
  fixture: GuestStaysSampleFile,
): Promise<SeedGuestStaysResult> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant || tenant.id !== tenantId) {
    return { ok: false, error: "Tenant not found." };
  }

  const pricing = normalizePricingSetup(tenant.pricing_setup);
  const occupancyByType = maxOccupancyByRoomTypeId(normalizeRoomTypes(tenant.room_types));
  const currency = pricing.currency;
  const now = new Date();

  const { data: roomRows, error: roomErr } = await supabase
    .schema("hotel")
    .from("room_units")
    .select("id,room_code,room_type_code")
    .eq("tenant_id", tenantId);
  if (roomErr) return { ok: false, error: `room_units: ${roomErr.message}` };

  type RoomRow = { id: string; room_code: string; room_type_code: string };
  const roomByCode = new Map((roomRows ?? []).map((r) => [r.room_code as string, r as RoomRow]));
  const assignedRoomIds = new Set<string>();
  const warnings: string[] = [];

  const defaultRoomType = ((tenant.room_types ?? []) as { id?: string }[])[0]?.id;
  if (!defaultRoomType) {
    return { ok: false, error: "Tenant has no room types configured." };
  }

  function takeRoom(
    stayRef: string,
    requestedCode: string | null | undefined,
    mode: "exclusive" | "lookup",
  ): RoomRow | null | { error: string } {
    if (!requestedCode) return null;

    const exact = roomByCode.get(requestedCode);
    if (mode === "lookup") return exact ?? null;

    if (!exact) {
      return {
        error: `${stayRef}: room ${requestedCode} is not in this property's inventory. Use an existing room code only.`,
      };
    }
    if (assignedRoomIds.has(exact.id)) {
      return {
        error: `${stayRef}: room ${requestedCode} is already assigned to another checked-in stay in this fixture.`,
      };
    }
    assignedRoomIds.add(exact.id);
    return exact;
  }

  const groupIdByRef = new Map<string, string>();
  const groupRows: Record<string, unknown>[] = [];

  for (const g of fixture.group_bookings ?? []) {
    const id = fixtureUuid("group", stayKey(g.ref));
    groupIdByRef.set(g.ref, id);
    groupRows.push({
      id,
      tenant_id: tenantId,
      group_name: g.group_name,
      coordinator_name: g.coordinator_name,
      coordinator_phone: g.coordinator_phone,
      room_count: g.room_count,
      shared_billing: g.shared_billing ?? false,
      bill_to_account: g.bill_to_account ?? null,
      arrival_at: resolveFixtureDate(g.arrival, now),
      departure_at: resolveFixtureDate(g.departure, now),
      notes: g.notes ?? null,
      created_at: now.toISOString(),
    });
  }

  const guestRows: Record<string, unknown>[] = [];
  const reservationRows: Record<string, unknown>[] = [];
  const reservationGuestRows: Record<string, unknown>[] = [];
  const folioRows: Record<string, unknown>[] = [];
  const occupiedRoomIds = new Set<string>();

  const statusOrder: Record<string, number> = {
    checked_in: 0,
    confirmed: 1,
    checked_out: 2,
    cancelled: 3,
    no_show: 4,
  };
  const sortedStays = [...fixture.stays].sort(
    (a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9),
  );

  for (const stay of sortedStays) {
    const sk = stayKey(stay.ref);
    const reservationId = fixtureUuid("reservation", sk);
    const booking = stay.booking;
    if (!booking) {
      return { ok: false, error: `${stay.ref}: missing booking block.` };
    }

    let roomUnitId: string | null = null;
    let roomTypeCode = stay.room_type_code ?? defaultRoomType;
    if (stay.room_code) {
      const mode = stay.status === "checked_in" ? "exclusive" : "lookup";
      const room = takeRoom(stay.ref, stay.room_code, mode);
      if (room && "error" in room) {
        return { ok: false, error: room.error };
      }
      if (room) {
        roomUnitId = room.id;
        roomTypeCode = room.room_type_code;
        if (stay.status === "checked_in") occupiedRoomIds.add(roomUnitId);
      }
    }

    const maxOccupancy = resolveMaxOccupancy(roomTypeCode, occupancyByType);
    const headBefore = stayHeadcount(stay.adults, stay.children);
    const clamped = clampStayOccupancy(stay.adults, stay.children ?? [], maxOccupancy);
    if (headBefore > maxOccupancy) {
      warnings.push(
        `${stay.ref}: occupancy ${headBefore} exceeds max ${maxOccupancy} for room type — clamped to ${stayHeadcount(clamped.adults, clamped.children)}.`,
      );
    }

    const arrivalAt = resolveFixtureDate(stay.arrival, now);
    const departureAt = resolveFixtureDate(stay.departure, now);
    const totalCharges = booking.total_room_charges ?? booking.rate_per_night * stay.nights;

    const stayGuests = resolveStayGuests(stay, sk, clamped.adults, clamped.children);

    for (const link of stayGuests) {
      const guest = buildGuestRow(tenantId, link.profile, link.guestKey, now);
      guestRows.push(guest);
      reservationGuestRows.push({
        id: fixtureUuid("res_guest", link.guestKey),
        reservation_id: reservationId,
        guest_id: guest.id,
        is_primary: link.isPrimary,
        relationship: link.relationship,
      });
    }

    const checkedInAt =
      stay.status === "checked_in" || stay.status === "checked_out" ? arrivalAt : null;
    const checkedOutAt = stay.status === "checked_out" ? departureAt : null;

    reservationRows.push({
      id: reservationId,
      tenant_id: tenantId,
      confirmation_code: booking.confirmation_code ?? `PJP-${sk}`,
      status: stay.status,
      arrival_at: arrivalAt,
      departure_at: departureAt,
      nights: stay.nights,
      adults: clamped.adults,
      children_json: buildStayChildrenJson(clamped.children),
      purpose_of_visit: stay.purpose_of_visit,
      room_type_code: roomTypeCode,
      room_unit_id: roomUnitId,
      room_preferences_text: booking.room_preferences ?? null,
      rate_type: booking.rate_type ?? "rack",
      season_code: booking.season_code ?? null,
      rate_per_night: booking.rate_per_night,
      total_room_charges: totalCharges,
      rate_overridden: false,
      rate_override_reason: null,
      show_rate_on_registration_card: true,
      vat_applicable: true,
      tax_exempt: false,
      tax_exemption_reason: null,
      tax_exemption_doc_ref: null,
      settlement_method: booking.settlement_method,
      preauth_amount: booking.preauth_amount ?? null,
      bill_to_account: booking.bill_to_account ?? null,
      po_number: null,
      folio_split_notes: null,
      min_payment_per_day: null,
      booking_channel: booking.booking_channel ?? null,
      market_segment: booking.market_segment ?? "transient",
      source: booking.source ?? "walk_in",
      travel_agent_name: booking.travel_agent_name ?? null,
      commission_plan: null,
      commission_value: null,
      guest_remarks: booking.guest_remarks ?? null,
      room_setup_notes: null,
      dietary_notes: booking.dietary_notes ?? null,
      accessibility_notes: null,
      vip_flag: booking.vip_flag ?? false,
      vip_notes: booking.vip_notes ?? null,
      special_occasion: booking.special_occasion ?? null,
      immigration_registration_required: false,
      voucher_number: null,
      registration_card_signed: booking.registration_card_signed ?? false,
      generate_bill: true,
      folio_number: booking.folio_number ?? `F-PJP-${sk}`,
      registration_number: booking.registration_number ?? `R-PJP-${sk}`,
      checked_in_at: checkedInAt,
      checked_out_at: checkedOutAt,
      checked_in_by_staff_id: null,
      digital_key_issued: booking.digital_key_issued ?? false,
      created_at: now.toISOString(),
      group_booking_id: stay.group_ref ? (groupIdByRef.get(stay.group_ref) ?? null) : null,
      pricing_snapshot: {},
      remarks_by_phase: {},
      guarantee_release_date: null,
    });

    (stay.folio ?? []).forEach((line, fi) => {
      const isPayment = line.kind === "payment";
      folioRows.push({
        id: fixtureUuid("folio", sk * 100 + fi),
        tenant_id: tenantId,
        reservation_id: reservationId,
        kind: line.kind,
        amount: isPayment ? -Math.abs(line.amount) : Math.abs(line.amount),
        method: isPayment ? (line.method ?? booking.settlement_method) : "system",
        status: "posted",
        description: line.description,
        department: line.department ?? (isPayment ? "front_desk" : "rooms"),
        posted_by: null,
        voided_at: null,
        voided_by: null,
        void_reason: null,
        currency_code: currency,
        fx_rate: null,
        original_amount: null,
        original_currency: null,
        split_leg: "guest",
        related_reservation_id: isPayment ? reservationId : null,
        cash_float_session_id: null,
        metadata: { seed: true, stay_ref: stay.ref },
        reference: `PJP-${sk}-${fi + 1}`,
        created_at: line.posted_at ? resolveFixtureDate(line.posted_at, now) : arrivalAt,
      });
    });
  }

  try {
    if (groupRows.length) await upsertBatch(supabase, "group_bookings", groupRows);
    await upsertBatch(supabase, "guests", guestRows);
    await upsertBatch(supabase, "reservations", reservationRows);
    await upsertBatch(supabase, "reservation_guests", reservationGuestRows);
    if (folioRows.length) await upsertBatch(supabase, "folio_transactions", folioRows);

    for (const roomId of occupiedRoomIds) {
      const { error } = await supabase
        .schema("hotel")
        .from("room_units")
        .update({ status: "occupied" })
        .eq("id", roomId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`room_units update: ${error.message}`);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const byStatus = fixture.stays.reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const warnText = warnings.length ? `\n  ⚠ ${warnings.length} room assignment note(s):\n    ${warnings.slice(0, 8).join("\n    ")}${warnings.length > 8 ? `\n    …and ${warnings.length - 8} more` : ""}` : "";

  return {
    ok: true,
    message:
      `Guest stays loaded: ${guestRows.length} guests, ${reservationRows.length} reservations` +
      ` (${Object.entries(byStatus)
        .map(([k, v]) => `${v} ${k}`)
        .join(", ")}), ${folioRows.length} folio lines, ${occupiedRoomIds.size} rooms marked occupied.` +
      warnText,
    counts: {
      guests: guestRows.length,
      reservations: reservationRows.length,
      folio: folioRows.length,
    },
  };
}

export function mergeGuestStayFixtures(files: GuestStaysSampleFile[]): GuestStaysSampleFile {
  return {
    _meta: { description: "Merged guest stay fixtures", version: 1 },
    group_bookings: files.flatMap((f) => f.group_bookings ?? []),
    stays: files.flatMap((f) => f.stays),
  };
}
