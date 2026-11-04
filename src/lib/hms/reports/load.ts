import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FB_TIME_ZONE, isValidTimeZone } from "@/lib/hms/fb-price-rules";
import { addDays, hotelDate, hotelDayStart, yearAgo } from "@/lib/hms/reports/dates";
import type { FolioRevenueLine, StayRow, WalkInFbOrder } from "@/lib/hms/reports/numbers";

/*
 * Loaders for the reports. Every query is paged: Supabase returns at most 1,000 rows per request, so a
 * single select quietly cuts off a busy hotel's figures.
 */

const PAGE = 1000;

/** Runs a query page by page until a short page comes back. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function getReportTimeZone(service: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await service.schema("hotel").from("tenant_fb_settings").select("time_zone").eq("tenant_id", tenantId).maybeSingle();
  return typeof data?.time_zone === "string" && isValidTimeZone(data.time_zone) ? data.time_zone : DEFAULT_FB_TIME_ZONE;
}

export type RoomInventory = { total: number; outOfOrder: number };

/** Rooms in the inventory, and how many are out of order right now (no date range is kept for that). */
export async function getRoomInventory(service: SupabaseClient, tenantId: string): Promise<RoomInventory> {
  const [all, ooo] = await Promise.all([
    service.schema("hotel").from("room_units").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    service.schema("hotel").from("room_units").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "out_of_order"),
  ]);
  return { total: all.count ?? 0, outOfOrder: ooo.count ?? 0 };
}

/** Stays that touch any night between two dates. */
export async function loadStays(service: SupabaseClient, tenantId: string, from: string, to: string): Promise<StayRow[]> {
  return fetchAll<StayRow>((a, b) =>
    service
      .schema("hotel")
      .from("reservations")
      .select("id,status,arrival_at,departure_at,total_room_charges,created_at,room_type_code")
      .eq("tenant_id", tenantId)
      .in("status", ["confirmed", "checked_in", "checked_out"])
      .lt("arrival_at", `${addDays(to, 1)}T00:00:00Z`)
      .gt("departure_at", `${from}T00:00:00Z`)
      .order("id", { ascending: true })
      .range(a, b),
  );
}

export async function loadFolioRevenue(service: SupabaseClient, tenantId: string, from: string, to: string, timeZone: string): Promise<FolioRevenueLine[]> {
  return fetchAll<FolioRevenueLine>((a, b) =>
    service
      .schema("hotel")
      .from("folio_transactions")
      .select("kind,amount,department,method,created_at,metadata,reference,description")
      .eq("tenant_id", tenantId)
      .is("voided_at", null)
      .in("kind", ["charge", "discount"])
      .gte("created_at", hotelDayStart(from, timeZone))
      .lt("created_at", hotelDayStart(addDays(to, 1), timeZone))
      .order("id", { ascending: true })
      .range(a, b),
  );
}

/** Closed outlet bills paid at the outlet. Bills charged to a room already show on the room's bill. */
export async function loadWalkInFb(service: SupabaseClient, tenantId: string, from: string, to: string, timeZone: string): Promise<WalkInFbOrder[]> {
  return fetchAll<WalkInFbOrder>((a, b) =>
    service
      .schema("hotel")
      .from("fb_orders")
      .select("subtotal,closed_at")
      .eq("tenant_id", tenantId)
      .eq("status", "closed")
      .neq("settlement_method", "room_charge")
      .is("voided_at", null)
      .gte("closed_at", hotelDayStart(from, timeZone))
      .lt("closed_at", hotelDayStart(addDays(to, 1), timeZone))
      .order("id", { ascending: true })
      .range(a, b),
  );
}

export type PeriodData = { stays: StayRow[]; folio: FolioRevenueLine[]; walkIn: WalkInFbOrder[] };

export async function loadPeriodData(service: SupabaseClient, tenantId: string, from: string, to: string, timeZone: string): Promise<PeriodData> {
  const [stays, folio, walkIn] = await Promise.all([
    loadStays(service, tenantId, from, to),
    loadFolioRevenue(service, tenantId, from, to, timeZone),
    loadWalkInFb(service, tenantId, from, to, timeZone),
  ]);
  return { stays, folio, walkIn };
}

/** The earliest date the hotel has any activity on record, or null when it has none. */
export async function getFirstActivityDate(service: SupabaseClient, tenantId: string): Promise<string | null> {
  const [res, fol] = await Promise.all([
    service.schema("hotel").from("reservations").select("arrival_at").eq("tenant_id", tenantId).order("arrival_at", { ascending: true }).limit(1).maybeSingle(),
    service.schema("hotel").from("folio_transactions").select("created_at").eq("tenant_id", tenantId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
  ]);
  const dates = [res.data?.arrival_at as string | undefined, fol.data?.created_at as string | undefined].filter((d): d is string => Boolean(d)).map((d) => d.slice(0, 10));
  return dates.length ? dates.sort()[0] : null;
}

/** Whether the hotel was already trading by the end of the period a year ago, so a comparison means something. */
export function hadActivityYearBefore(firstActivity: string | null, to: string): boolean {
  return firstActivity != null && firstActivity <= yearAgo(to);
}

export const REVENUE_BUDGET_CODES = { rooms: "4000", fb: "4100", other: "4200" } as const;

export type RevenueBudgets = {
  rooms: Map<string, number>;
  fb: Map<string, number>;
  other: Map<string, number>;
};

/** Monthly revenue budgets (from Accounts, Budgets) for Rooms, F&B and Other revenue. */
export async function loadRevenueBudgets(service: SupabaseClient, tenantId: string, fromMonth: string, toMonth: string): Promise<RevenueBudgets> {
  const out: RevenueBudgets = { rooms: new Map(), fb: new Map(), other: new Map() };
  const { data: accounts } = await service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id,code")
    .eq("tenant_id", tenantId)
    .in("code", Object.values(REVENUE_BUDGET_CODES));
  const byId = new Map((accounts ?? []).map((a) => [a.id as string, a.code as string]));
  if (byId.size === 0) return out;
  const rows = await fetchAll<{ account_id: string; period_month: string; amount: number | string }>((a, b) =>
    service
      .schema("hotel")
      .from("account_budgets")
      .select("account_id,period_month,amount")
      .eq("tenant_id", tenantId)
      .in("account_id", [...byId.keys()])
      .gte("period_month", fromMonth)
      .lte("period_month", toMonth)
      .order("period_month", { ascending: true })
      .range(a, b),
  );
  for (const r of rows) {
    const code = byId.get(r.account_id);
    const target = code === REVENUE_BUDGET_CODES.rooms ? out.rooms : code === REVENUE_BUDGET_CODES.fb ? out.fb : code === REVENUE_BUDGET_CODES.other ? out.other : null;
    if (target) target.set(r.period_month, (target.get(r.period_month) ?? 0) + (Number(r.amount) || 0));
  }
  return out;
}

export { hotelDate };
