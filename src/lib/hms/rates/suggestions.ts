import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { addDays, daysBetween, nightBase } from "@/lib/hms/rates/pricing";
import { savePriceRule } from "@/lib/hms/rates/admin";
import { ensureDefaultPlan, loadRateBook } from "@/lib/hms/rates/book";
import { suggestPrice, type SuggestionLimits } from "@/lib/hms/rates/suggestions-core";
import { hotelDate } from "@/lib/hms/reports/dates";
import { getReportTimeZone } from "@/lib/hms/reports/load";
import { nightCountsForType } from "@/lib/hms/reservation-availability";

/*
 * Price suggestions: the database side. Generating looks at rooms sold and recent bookings for
 * every room type and night in the horizon, and keeps one open suggestion per room type and night.
 * Accepting one adds an ordinary price rule on the default plan (so derived plans follow it);
 * nothing is changed without a person pressing Accept.
 */

export type RevenueSettings = SuggestionLimits & { suggestionsEnabled: boolean; horizonDays: number };

export const DEFAULT_REVENUE_SETTINGS: RevenueSettings = { suggestionsEnabled: true, maxStepPercent: 15, floorPercent: 70, ceilingPercent: 160, horizonDays: 45 };

export async function getRevenueSettings(db: SupabaseClient, tenantId: string): Promise<RevenueSettings> {
  const { data } = await db.schema("hotel").from("revenue_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (!data) return DEFAULT_REVENUE_SETTINGS;
  return {
    suggestionsEnabled: data.suggestions_enabled !== false,
    maxStepPercent: Number(data.max_step_percent) || DEFAULT_REVENUE_SETTINGS.maxStepPercent,
    floorPercent: Number(data.floor_percent) || DEFAULT_REVENUE_SETTINGS.floorPercent,
    ceilingPercent: Number(data.ceiling_percent) || DEFAULT_REVENUE_SETTINGS.ceilingPercent,
    horizonDays: Number(data.horizon_days) || DEFAULT_REVENUE_SETTINGS.horizonDays,
  };
}

export async function saveRevenueSettings(db: SupabaseClient, ctx: { tenantId: string; userId: string }, s: RevenueSettings): Promise<{ ok: true } | { ok: false; error: string }> {
  if (s.floorPercent > 100) return { ok: false, error: "The lowest price can't be above 100% of your Settings price." };
  if (s.ceilingPercent < 100) return { ok: false, error: "The highest price can't be below 100% of your Settings price." };
  if (s.maxStepPercent < 1 || s.maxStepPercent > 100) return { ok: false, error: "The biggest step must be between 1% and 100%." };
  if (s.horizonDays < 7 || s.horizonDays > 180) return { ok: false, error: "Look ahead between 7 and 180 days." };
  const before = await getRevenueSettings(db, ctx.tenantId);
  const { error } = await db.schema("hotel").from("revenue_settings").upsert(
    {
      tenant_id: ctx.tenantId,
      suggestions_enabled: s.suggestionsEnabled,
      max_step_percent: s.maxStepPercent,
      floor_percent: s.floorPercent,
      ceiling_percent: s.ceilingPercent,
      horizon_days: s.horizonDays,
      updated_by: ctx.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { ok: false, error: "The settings couldn't be saved." };
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "revenue_settings_saved", entityType: "tenant", entityId: ctx.tenantId, before, after: s });
  return { ok: true };
}

export type PriceSuggestion = {
  id: string;
  roomTypeCode: string;
  stayDate: string;
  currentPrice: number;
  suggestedPrice: number;
  occupancyPercent: number;
  expectedPercent: number;
  pickupNights: number;
  reason: string;
  status: "open" | "accepted" | "dismissed" | "stale";
  decidedAt: string | null;
  createdAt: string;
};

function fromRow(r: Record<string, unknown>): PriceSuggestion {
  return {
    id: String(r.id),
    roomTypeCode: String(r.room_type_code),
    stayDate: String(r.stay_date).slice(0, 10),
    currentPrice: Number(r.current_price),
    suggestedPrice: Number(r.suggested_price),
    occupancyPercent: Number(r.occupancy_percent),
    expectedPercent: Number(r.expected_percent),
    pickupNights: Number(r.pickup_nights),
    reason: String(r.reason),
    status: r.status as PriceSuggestion["status"],
    decidedAt: (r.decided_at as string | null) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function listSuggestions(db: SupabaseClient, tenantId: string, opts: { status?: PriceSuggestion["status"]; limit?: number } = {}): Promise<PriceSuggestion[]> {
  let q = db.schema("hotel").from("price_suggestions").select("*").eq("tenant_id", tenantId);
  if (opts.status) q = q.eq("status", opts.status);
  const { data } = await q.order("stay_date").limit(opts.limit ?? 300);
  return (data ?? []).map(fromRow);
}

/** Nights booked in the last 7 days, per night, for one room type. */
async function pickupByNight(db: SupabaseClient, tenantId: string, roomTypeCode: string, from: string, to: string, since: string): Promise<Record<string, number>> {
  const { data } = await db
    .schema("hotel")
    .from("reservations")
    .select("arrival_at,departure_at")
    .eq("tenant_id", tenantId)
    .eq("room_type_code", roomTypeCode)
    .in("status", ["confirmed", "checked_in"])
    .gte("created_at", since)
    .lt("arrival_at", `${to}T23:59:59Z`)
    .gt("departure_at", `${from}T00:00:00Z`)
    .limit(2000);
  const out: Record<string, number> = {};
  for (const r of data ?? []) {
    const a = String(r.arrival_at).slice(0, 10);
    const d = String(r.departure_at).slice(0, 10);
    for (let day = a < from ? from : a; day < d && day <= to; day = addDays(day, 1)) out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}

export async function generateSuggestions(
  db: SupabaseClient,
  tenant: { id: string; room_types: unknown; pricing_setup: unknown },
  userId: string | null,
): Promise<{ created: number; open: number }> {
  const settings = await getRevenueSettings(db, tenant.id);
  if (!settings.suggestionsEnabled) return { created: 0, open: 0 };
  const plan = await ensureDefaultPlan(db, tenant.id, userId);
  const book = await loadRateBook(db, tenant);
  const tz = await getReportTimeZone(db, tenant.id);
  const today = hotelDate(new Date(), tz);
  const last = addDays(today, settings.horizonDays - 1);
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const hotel = db.schema("hotel");

  // A night someone decided on in the last 3 days isn't suggested again straight away.
  const { data: decided } = await hotel
    .from("price_suggestions")
    .select("room_type_code,stay_date")
    .eq("tenant_id", tenant.id)
    .in("status", ["accepted", "dismissed"])
    .gte("decided_at", new Date(Date.now() - 3 * 86_400_000).toISOString());
  const recentlyDecided = new Set((decided ?? []).map((d) => `${d.room_type_code}|${String(d.stay_date).slice(0, 10)}`));

  const fresh: Record<string, unknown>[] = [];
  const keep = new Set<string>();
  for (const t of book.roomTypes) {
    const [counts, pickup] = await Promise.all([
      nightCountsForType(db, { tenantId: tenant.id, roomTypeCode: t.id, fromDay: today, toDay: addDays(last, 1) }),
      pickupByNight(db, tenant.id, t.id, today, last, since),
    ]);
    for (const c of counts) {
      const daysOut = daysBetween(today, c.night);
      const current = nightBase(book, plan, t, c.night).base;
      const s = suggestPrice({
        daysOut,
        stock: c.stock,
        taken: c.sold + c.held,
        pickup: pickup[c.night] ?? 0,
        currentPrice: current,
        basePrice: t.baseRate,
        limits: settings,
      });
      if (!s || recentlyDecided.has(`${t.id}|${c.night}`)) continue;
      keep.add(`${t.id}|${c.night}`);
      fresh.push({
        tenant_id: tenant.id,
        room_type_code: t.id,
        stay_date: c.night,
        rate_plan_id: plan.id,
        current_price: current,
        suggested_price: s.suggestedPrice,
        occupancy_percent: s.occupancyPercent,
        expected_percent: s.expectedPercent,
        pickup_nights: pickup[c.night] ?? 0,
        reason: s.reason,
        status: "open",
      });
    }
  }

  // Open suggestions that no longer apply (or whose night has passed) are marked stale, not deleted.
  const { data: open } = await hotel.from("price_suggestions").select("id,room_type_code,stay_date").eq("tenant_id", tenant.id).eq("status", "open");
  const staleIds = (open ?? []).filter((o) => !keep.has(`${o.room_type_code}|${String(o.stay_date).slice(0, 10)}`)).map((o) => o.id as string);
  if (staleIds.length > 0) await hotel.from("price_suggestions").update({ status: "stale" }).in("id", staleIds);

  const existing = new Set((open ?? []).map((o) => `${o.room_type_code}|${String(o.stay_date).slice(0, 10)}`));
  const toInsert = fresh.filter((f) => !existing.has(`${f.room_type_code}|${f.stay_date}`));
  if (toInsert.length > 0) await hotel.from("price_suggestions").insert(toInsert);
  // Refresh the ones that stay open with today's numbers.
  for (const f of fresh.filter((f) => existing.has(`${f.room_type_code}|${f.stay_date}`))) {
    await hotel
      .from("price_suggestions")
      .update({
        current_price: f.current_price,
        suggested_price: f.suggested_price,
        occupancy_percent: f.occupancy_percent,
        expected_percent: f.expected_percent,
        pickup_nights: f.pickup_nights,
        reason: f.reason,
      })
      .eq("tenant_id", tenant.id)
      .eq("room_type_code", f.room_type_code as string)
      .eq("stay_date", f.stay_date as string)
      .eq("status", "open");
  }
  return { created: toInsert.length, open: fresh.length };
}

export async function decideSuggestion(
  db: SupabaseClient,
  ctx: { tenantId: string; userId: string; roomTypeIds: string[] },
  id: string,
  decision: "accept" | "dismiss",
  price?: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const hotel = db.schema("hotel");
  const { data } = await hotel.from("price_suggestions").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!data) return { ok: false, error: "That suggestion wasn't found." };
  const s = fromRow(data);
  if (s.status !== "open") return { ok: false, error: "That suggestion has already been dealt with." };

  if (decision === "accept") {
    const planId = data.rate_plan_id as string | null;
    if (!planId) return { ok: false, error: "The plan for this suggestion no longer exists." };
    const final = price != null && Number.isFinite(price) ? price : s.suggestedPrice;
    if (final < 0) return { ok: false, error: "The price can't be below zero." };
    const rule = await savePriceRule(
      db,
      ctx,
      { ratePlanId: planId, roomTypeCode: s.roomTypeCode, dateFrom: s.stayDate, dateTo: s.stayDate, daysOfWeek: null, price: final, priority: 20, label: "Suggested price" },
      "suggestion",
    );
    if (!rule.ok) return rule;
  }
  await hotel
    .from("price_suggestions")
    .update({ status: decision === "accept" ? "accepted" : "dismissed", decided_by: ctx.userId, decided_at: new Date().toISOString() })
    .eq("tenant_id", ctx.tenantId)
    .eq("id", id);
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: decision === "accept" ? "price_suggestion_accepted" : "price_suggestion_dismissed",
    entityType: "price_suggestion",
    entityId: id,
    after: { roomTypeCode: s.roomTypeCode, stayDate: s.stayDate, from: s.currentPrice, to: price ?? s.suggestedPrice },
  });
  return { ok: true };
}
