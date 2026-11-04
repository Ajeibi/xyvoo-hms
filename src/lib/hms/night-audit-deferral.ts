import type { SupabaseClient } from "@supabase/supabase-js";
import { EARLY_CHECKOUT_ADJUSTMENT_REF, isBookedStayLine, stayLinePart } from "@/lib/hms/folio";
import { isExtraNightLine } from "@/lib/hms/folio-extra-nights";
import { addDaysToDate, daysBetweenDates, hotelLocalDate, zonedDayBounds } from "@/lib/hms/business-date";

/*
 * Room revenue night by night. A stay's room charge is posted to the bill when the guest checks in,
 * but the hotel only earns it as the nights pass. With this on, the night audit books that charge
 * to Deferred Revenue (2400) and each audit moves one night of it to Room Revenue (4000).
 * Taxes and levies are never deferred: they are owed to the government as charged.
 */

/** Taxes on a room that the hotel collects for the government. */
export const GOVERNMENT_TAX_PARTS = new Set(["vat", "state_levy", "stamp_levy"]);

type LineShape = {
  kind: string;
  department: string | null;
  method: string;
  metadata?: Record<string, unknown> | null;
  reference?: string | null;
  description?: string | null;
};

/**
 * A line that is part of a stay's room revenue (the room, the service charge, extra nights, the
 * credit for unused nights, a room discount) rather than a tax, a late check-out fee or a no-show fee.
 */
export function isStayRevenueLine(l: LineShape): boolean {
  if (l.department !== "rooms") return false;
  const meta = l.metadata ?? {};
  const ref = l.reference ?? "";
  const part = stayLinePart({ metadata: meta, reference: l.reference ?? null, description: l.description ?? null });
  if (GOVERNMENT_TAX_PARTS.has(part)) return false;
  if (l.kind === "charge") {
    return isBookedStayLine({ kind: "charge", department: l.department, method: l.method, metadata: meta, reference: l.reference ?? null, description: l.description ?? null }) || isExtraNightLine({ reference: l.reference ?? null });
  }
  if (l.kind === "discount") {
    if (Array.isArray(meta.allocation)) return false;
    return ref === EARLY_CHECKOUT_ADJUSTMENT_REF || (ref.startsWith("discount:") && meta.target !== "bill");
  }
  return false;
}

/** The signed amount a stay line adds to room revenue (charges +, discounts −). */
export function stayLineAmount(l: { kind: string; amount: number | string }): number {
  const a = Math.abs(Number(l.amount) || 0);
  return l.kind === "discount" ? -a : a;
}

type StayDates = {
  arrival_at: string;
  departure_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
};

/** The first night of the stay: when the guest actually checked in, else the booked arrival. */
export function stayStartDate(r: StayDates, timeZone: string): string {
  return hotelLocalDate(new Date(r.checked_in_at ?? r.arrival_at), timeZone);
}

/** True when a stay's room charge is spread over its nights: it starts on or after the day this began. */
export function isDeferredStay(r: StayDates, from: string | null, timeZone: string): boolean {
  return Boolean(from) && stayStartDate(r, timeZone) >= (from as string);
}

/**
 * How much of a stay's booked room revenue is earned once `auditDate` has passed. Pure.
 * The whole of it by the last night (or the night before the guest left early), a share of it before.
 */
export function earnedRoomRevenue(p: { booked: number; stayStart: string; scheduledEnd: string; actualEnd: string | null; auditDate: string }): number {
  const round = (n: number) => Math.round(n * 100) / 100;
  const end = p.actualEnd && p.actualEnd < p.scheduledEnd ? p.actualEnd : p.scheduledEnd;
  if (addDaysToDate(p.auditDate, 1) >= end) return round(p.booked);
  const nights = Math.max(1, daysBetweenDates(p.stayStart, p.scheduledEnd));
  const elapsed = Math.min(nights, Math.max(0, daysBetweenDates(p.stayStart, p.auditDate) + 1));
  return round((p.booked * elapsed) / nights);
}

export type RoomRelease = { reservationId: string; nightDate: string; amount: number };

type ReservationRow = StayDates & { id: string };

const RES_COLUMNS = "id,arrival_at,departure_at,checked_in_at,checked_out_at";

/**
 * What to move from Deferred Revenue to Room Revenue for `auditDate`: for each stay under the
 * night-by-night rule, what's earned by the end of the day less what earlier nights already released.
 * Working from the running totals means a redone or caught-up audit lands on the same figures.
 */
export async function computeRoomReleases(
  service: SupabaseClient,
  tenantId: string,
  auditDate: string,
  timeZone: string,
  from: string,
): Promise<RoomRelease[]> {
  const { start: windowStart } = zonedDayBounds(addDaysToDate(auditDate, -1), timeZone);
  const { end: dayEnd } = zonedDayBounds(auditDate, timeZone);
  const { data: resData } = await service
    .schema("hotel")
    .from("reservations")
    .select(RES_COLUMNS)
    .eq("tenant_id", tenantId)
    .in("status", ["checked_in", "checked_out"])
    .gte("departure_at", windowStart)
    .lt("arrival_at", dayEnd)
    .limit(2000);
  const stays = ((resData ?? []) as ReservationRow[]).filter((r) => isDeferredStay(r, from, timeZone) && stayStartDate(r, timeZone) <= auditDate);
  if (stays.length === 0) return [];

  const booked = new Map<string, number>();
  const released = new Map<string, number>();
  for (let i = 0; i < stays.length; i += 100) {
    const ids = stays.slice(i, i + 100).map((s) => s.id);
    const [{ data: lines }, { data: done }] = await Promise.all([
      service
        .schema("hotel")
        .from("folio_transactions")
        .select("reservation_id,kind,amount,method,department,metadata,reference,description")
        .eq("tenant_id", tenantId)
        .in("reservation_id", ids)
        .is("voided_at", null)
        .lte("business_date", auditDate)
        .limit(5000),
      service.schema("hotel").from("room_revenue_releases").select("reservation_id,amount").eq("tenant_id", tenantId).in("reservation_id", ids).lt("night_date", auditDate),
    ]);
    for (const l of (lines ?? []) as (LineShape & { reservation_id: string; amount: number | string })[]) {
      if (isStayRevenueLine(l)) booked.set(l.reservation_id, (booked.get(l.reservation_id) ?? 0) + stayLineAmount(l));
    }
    for (const d of (done ?? []) as { reservation_id: string; amount: number | string }[]) {
      released.set(d.reservation_id, (released.get(d.reservation_id) ?? 0) + (Number(d.amount) || 0));
    }
  }

  const out: RoomRelease[] = [];
  for (const s of stays) {
    const target = earnedRoomRevenue({
      booked: booked.get(s.id) ?? 0,
      stayStart: stayStartDate(s, timeZone),
      scheduledEnd: hotelLocalDate(new Date(s.departure_at), timeZone),
      actualEnd: s.checked_out_at ? hotelLocalDate(new Date(s.checked_out_at), timeZone) : null,
      auditDate,
    });
    const amount = Math.round((target - (released.get(s.id) ?? 0)) * 100) / 100;
    if (Math.abs(amount) >= 0.01) out.push({ reservationId: s.id, nightDate: auditDate, amount });
  }
  return out;
}

/** Marks which of a day's folio lines belong to stays under the night-by-night rule. */
export async function markDeferredLines<T extends LineShape & { reservation_id?: string | null }>(
  service: SupabaseClient,
  tenantId: string,
  rows: T[],
  from: string,
  timeZone: string,
): Promise<(T & { deferred: boolean })[]> {
  const ids = [...new Set(rows.filter((r) => isStayRevenueLine(r) && r.reservation_id).map((r) => r.reservation_id as string))];
  const deferredIds = new Set<string>();
  for (let i = 0; i < ids.length; i += 100) {
    const { data } = await service.schema("hotel").from("reservations").select(RES_COLUMNS).eq("tenant_id", tenantId).in("id", ids.slice(i, i + 100));
    for (const r of (data ?? []) as ReservationRow[]) if (isDeferredStay(r, from, timeZone)) deferredIds.add(r.id);
  }
  return rows.map((r) => ({ ...r, deferred: Boolean(r.reservation_id && deferredIds.has(r.reservation_id) && isStayRevenueLine(r)) }));
}
