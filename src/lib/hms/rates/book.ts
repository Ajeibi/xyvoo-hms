import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizePricingSetup, normalizeRoomTypes, type HotelPricingSetup, type HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { priceStay, type PriceStayInput, type PriceStayResult } from "@/lib/hms/rates/pricing";
import type { PriceRule, RateBook, RatePlan, Restriction } from "@/lib/hms/rates/types";

/*
 * Reading the rate book from the database. The pricing itself is in pricing.ts and never touches
 * the database, so a screen can load the book once and price many stays against it.
 */

type Row = Record<string, unknown>;

const num = (v: unknown, d = 0) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? d : Number(v));
const str = (v: unknown) => (typeof v === "string" ? v : null);
const day = (v: unknown) => (typeof v === "string" ? v.slice(0, 10) : null);
const ints = (v: unknown): number[] | null => (Array.isArray(v) && v.length > 0 ? v.map((x) => Number(x)).filter((x) => Number.isInteger(x) && x >= 0 && x <= 6) : null);

export function planFromRow(r: Row): RatePlan {
  return {
    id: String(r.id),
    code: String(r.code),
    name: String(r.name),
    description: str(r.description),
    parentPlanId: str(r.parent_plan_id),
    deriveKind: r.derive_kind === "percent" || r.derive_kind === "amount" ? r.derive_kind : null,
    deriveValue: num(r.derive_value),
    boardBasis: str(r.board_basis) ?? "Room only",
    refundable: r.refundable !== false,
    prepayRequired: r.prepay_required === true,
    roomTypeCodes: Array.isArray(r.room_type_codes) && r.room_type_codes.length > 0 ? (r.room_type_codes as string[]) : null,
    channels: Array.isArray(r.channels) ? (r.channels as string[]) : [],
    arCustomerId: str(r.ar_customer_id),
    sellFrom: day(r.sell_from),
    sellTo: day(r.sell_to),
    isDefault: r.is_default === true,
    active: r.active !== false,
    sortOrder: num(r.sort_order),
  };
}

export function priceFromRow(r: Row): PriceRule {
  return {
    id: String(r.id),
    ratePlanId: String(r.rate_plan_id),
    roomTypeCode: str(r.room_type_code),
    dateFrom: day(r.date_from) ?? "",
    dateTo: day(r.date_to) ?? "",
    daysOfWeek: ints(r.days_of_week),
    price: num(r.price),
    priority: num(r.priority),
    label: str(r.label),
    source: r.source === "suggestion" ? "suggestion" : "manual",
    createdAt: str(r.created_at) ?? "",
  };
}

export function restrictionFromRow(r: Row): Restriction {
  return {
    id: String(r.id),
    ratePlanId: str(r.rate_plan_id),
    roomTypeCode: str(r.room_type_code),
    dateFrom: day(r.date_from) ?? "",
    dateTo: day(r.date_to) ?? "",
    daysOfWeek: ints(r.days_of_week),
    minStay: r.min_stay == null ? null : num(r.min_stay),
    maxStay: r.max_stay == null ? null : num(r.max_stay),
    closed: r.closed === true,
    closedToArrival: r.closed_to_arrival === true,
    closedToDeparture: r.closed_to_departure === true,
    minAdvanceDays: r.min_advance_days == null ? null : num(r.min_advance_days),
    maxAdvanceDays: r.max_advance_days == null ? null : num(r.max_advance_days),
    note: str(r.note),
  };
}

/**
 * Everything the price function needs for a hotel. Rules that ended long ago are left out
 * (`since` defaults to 30 days back) so the book stays small for a hotel that has run for years.
 */
export async function loadRateBook(
  db: SupabaseClient,
  tenant: { id: string; room_types: unknown; pricing_setup: unknown },
  opts: { since?: string } = {},
): Promise<RateBook> {
  return rateBookFor(db, tenant.id, normalizeRoomTypes(tenant.room_types), normalizePricingSetup(tenant.pricing_setup), opts);
}

/** The same, for callers that already hold the hotel's room types and pricing setup. */
export async function rateBookFor(
  db: SupabaseClient,
  tenantId: string,
  roomTypes: HotelRoomTypeSetup[],
  pricing: HotelPricingSetup,
  opts: { since?: string } = {},
): Promise<RateBook> {
  const since = opts.since ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
  const hotel = db.schema("hotel");
  const [plans, prices, restrictions] = await Promise.all([
    hotel.from("rate_plans").select("*").eq("tenant_id", tenantId).order("sort_order").order("created_at"),
    hotel.from("rate_prices").select("*").eq("tenant_id", tenantId).gte("date_to", since).limit(5000),
    hotel.from("rate_restrictions").select("*").eq("tenant_id", tenantId).gte("date_to", since).limit(5000),
  ]);
  return {
    currency: pricing.currency,
    extraAdultRate: pricing.extraAdultRate,
    extraChildRate: pricing.extraChildRate,
    roomTypes: roomTypes.map((t) => ({ id: t.id, name: t.name, baseRate: t.baseRate, maxOccupancy: t.maxOccupancy })),
    plans: (plans.data ?? []).map(planFromRow),
    prices: (prices.data ?? []).map(priceFromRow),
    restrictions: (restrictions.data ?? []).map(restrictionFromRow),
  };
}

/** Load the book and price one stay. For a screen pricing many stays, load the book once and call priceStay. */
export async function priceStayFor(
  db: SupabaseClient,
  tenant: { id: string; room_types: unknown; pricing_setup: unknown },
  input: PriceStayInput,
): Promise<PriceStayResult> {
  return priceStay(await loadRateBook(db, tenant, { since: input.arrivalDay < new Date().toISOString().slice(0, 10) ? input.arrivalDay : undefined }), input);
}

/** Make sure the hotel has a default plan (Room only), priced from Settings until rules are added. */
export async function ensureDefaultPlan(db: SupabaseClient, tenantId: string, userId: string | null): Promise<RatePlan> {
  const hotel = db.schema("hotel");
  const { data: existing } = await hotel.from("rate_plans").select("*").eq("tenant_id", tenantId).eq("is_default", true).maybeSingle();
  if (existing) return planFromRow(existing);
  const { data, error } = await hotel
    .from("rate_plans")
    .insert({
      tenant_id: tenantId,
      code: "BAR",
      name: "Room only",
      description: "The hotel's standard price. Follows the room prices in Settings until you add price rules.",
      board_basis: "Room only",
      channels: ["front_desk", "website", "partner", "corporate"],
      is_default: true,
      created_by: userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    // Another request may have made it a moment ago.
    const { data: again } = await hotel.from("rate_plans").select("*").eq("tenant_id", tenantId).eq("is_default", true).maybeSingle();
    if (again) return planFromRow(again);
    throw new Error("The default rate plan couldn't be created.");
  }
  return planFromRow(data);
}
