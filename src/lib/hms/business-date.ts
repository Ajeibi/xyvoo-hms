import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_FB_TIME_ZONE, isValidTimeZone } from "@/lib/hms/fb-price-rules";

/*
 * The hotel's business date: the day the hotel is still trading on, which can lag the calendar
 * until the night audit closes it. It is the day after the last night audit that stands (or the
 * start date an owner set, or today when nothing has been audited). Nothing is stored for it, so
 * it can't drift from the audits. Other modules that need "which day is this posting for" should
 * call getBusinessDate here instead of reading the clock.
 */

export function addDaysToDate(date: string, days: number): string {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysBetweenDates(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);
}

/** The calendar date at the hotel, as YYYY-MM-DD. */
export function hotelLocalDate(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function hotelLocalHour(now: Date, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
}

function offsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - at.getTime();
}

/** The UTC instants where a hotel-local calendar day starts and ends. */
export function zonedDayBounds(date: string, timeZone: string): { start: string; end: string } {
  const startOf = (d: string) => {
    const guess = new Date(`${d}T00:00:00Z`);
    return new Date(guess.getTime() - offsetMs(guess, timeZone));
  };
  return { start: startOf(date).toISOString(), end: startOf(addDaysToDate(date, 1)).toISOString() };
}

export type BusinessDateInput = {
  /** The latest audited date whose posting still stands. */
  lastAudited: string | null;
  /** Start date an owner set. */
  startDate: string | null;
  /** The hotel's calendar date today. */
  today: string;
};

export function pickBusinessDate({ lastAudited, startDate, today }: BusinessDateInput): string {
  const afterAudit = lastAudited ? addDaysToDate(lastAudited, 1) : null;
  if (afterAudit && startDate) return startDate > afterAudit ? startDate : afterAudit;
  return afterAudit ?? startDate ?? today;
}

/** A day can be closed once it has finished at the hotel. */
export function isAuditable(date: string, today: string): boolean {
  return date < today;
}

export async function getHotelTimeZone(service: SupabaseClient, tenantId: string): Promise<string> {
  const { data } = await service.schema("hotel").from("tenant_fb_settings").select("time_zone").eq("tenant_id", tenantId).maybeSingle();
  return typeof data?.time_zone === "string" && isValidTimeZone(data.time_zone) ? data.time_zone : DEFAULT_FB_TIME_ZONE;
}

/** The latest audited date that still stands (not reversed). An empty day rolled forward counts. */
export async function getLastAuditedDate(service: SupabaseClient, tenantId: string): Promise<string | null> {
  const { data: runs } = await service
    .schema("hotel")
    .from("night_audit_runs")
    .select("audit_date,journal_entry_id")
    .eq("tenant_id", tenantId)
    .order("audit_date", { ascending: false })
    .limit(30);
  if (!runs?.length) return null;
  const ids = runs.map((r) => r.journal_entry_id as string | null).filter((id): id is string => Boolean(id));
  const reversed = new Set<string>();
  if (ids.length > 0) {
    const { data: entries } = await service.schema("hotel").from("journal_entries").select("id,reversed_by").eq("tenant_id", tenantId).in("id", ids);
    for (const e of entries ?? []) if (e.reversed_by) reversed.add(e.id as string);
  }
  const standing = runs.find((r) => !r.journal_entry_id || !reversed.has(r.journal_entry_id as string));
  return (standing?.audit_date as string | undefined) ?? null;
}

export type BusinessDateInfo = {
  businessDate: string;
  today: string;
  timeZone: string;
  lastAudited: string | null;
  /** Whole days the business date trails the calendar. */
  daysBehind: number;
  /** True once the business date's day has finished at the hotel, so it can be closed. */
  canAudit: boolean;
};

/** The date a posting made now belongs to: the hotel's business date, or its own today if that can't be read. */
export async function postingDate(service: SupabaseClient, tenantId: string): Promise<string> {
  try {
    return (await getBusinessDate(service, tenantId)).businessDate;
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function getBusinessDate(service: SupabaseClient, tenantId: string, now: Date = new Date()): Promise<BusinessDateInfo> {
  const [timeZone, lastAudited, settings] = await Promise.all([
    getHotelTimeZone(service, tenantId),
    getLastAuditedDate(service, tenantId),
    service.schema("hotel").from("night_audit_settings").select("start_date").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const today = hotelLocalDate(now, timeZone);
  const businessDate = pickBusinessDate({ lastAudited, startDate: (settings.data?.start_date as string | null) ?? null, today });
  return {
    businessDate,
    today,
    timeZone,
    lastAudited,
    daysBehind: Math.max(0, daysBetweenDates(businessDate, today)),
    canAudit: isAuditable(businessDate, today),
  };
}
