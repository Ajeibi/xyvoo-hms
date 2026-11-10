import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays } from "@/lib/hms/hr/hr-shared";

/*
 * Public holidays, per hotel. Leave requests and pro-rated pay skip them as well as weekends.
 * The fixed Nigerian holidays and Easter can be added in one click; Eid al-Fitr, Eid al-Adha and
 * the Prophet's birthday move with the moon and are declared by the Federal Government each year,
 * so HR adds those dates when they are announced (as well as any replacement Monday the
 * government declares when a holiday falls on a weekend).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PublicHoliday = { id: string; date: string; name: string };

/** Easter Sunday (Gregorian), by the anonymous Gregorian algorithm. */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Nigeria's public holidays that fall on a known date (Public Holidays Act, as amended). */
export function nigeriaFixedHolidays(year: number): { date: string; name: string }[] {
  const easter = easterSunday(year);
  return [
    { date: `${year}-01-01`, name: "New Year's Day" },
    { date: addDays(easter, -2), name: "Good Friday" },
    { date: addDays(easter, 1), name: "Easter Monday" },
    { date: `${year}-05-01`, name: "Workers' Day" },
    { date: `${year}-06-12`, name: "Democracy Day" },
    { date: `${year}-10-01`, name: "Independence Day" },
    { date: `${year}-12-25`, name: "Christmas Day" },
    { date: `${year}-12-26`, name: "Boxing Day" },
  ].sort((x, y) => x.date.localeCompare(y.date));
}

export async function listHolidays(service: SupabaseClient, tenantId: string, opts: { from?: string; to?: string } = {}): Promise<PublicHoliday[]> {
  let q = service.schema("hotel").from("hr_public_holidays").select("id, holiday_date, name").eq("tenant_id", tenantId).order("holiday_date").limit(1000);
  if (opts.from) q = q.gte("holiday_date", opts.from);
  if (opts.to) q = q.lte("holiday_date", opts.to);
  const { data } = await q;
  return (data ?? []).map((r: any) => ({ id: r.id, date: r.holiday_date, name: r.name }));
}

/** Just the dates, for working-day counts. Empty (weekends only) if the table isn't there yet. */
export async function holidayDates(service: SupabaseClient, tenantId: string, from: string, to: string): Promise<string[]> {
  return (await listHolidays(service, tenantId, { from, to })).map((h) => h.date);
}

export async function addHoliday(service: SupabaseClient, tenantId: string, date: string, name: string): Promise<{ error: string | null }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Choose a date." };
  if (!name.trim()) return { error: "Give the holiday a name." };
  const { error } = await service.schema("hotel").from("hr_public_holidays").insert({ tenant_id: tenantId, holiday_date: date, name: name.trim().slice(0, 80) });
  if (error) return { error: error.code === "23505" ? "There is already a holiday on that day." : "Couldn't add the holiday." };
  return { error: null };
}

export async function removeHoliday(service: SupabaseClient, tenantId: string, id: string): Promise<{ error: string | null }> {
  const { error } = await service.schema("hotel").from("hr_public_holidays").delete().eq("tenant_id", tenantId).eq("id", id);
  return { error: error ? "Couldn't remove the holiday." : null };
}

/** Adds the fixed Nigerian holidays for a year, skipping days already listed. Returns how many were added. */
export async function addNigeriaHolidays(service: SupabaseClient, tenantId: string, year: number): Promise<{ added: number; error: string | null }> {
  const rows = nigeriaFixedHolidays(year).map((h) => ({ tenant_id: tenantId, holiday_date: h.date, name: h.name }));
  const { data, error } = await service.schema("hotel").from("hr_public_holidays").upsert(rows, { onConflict: "tenant_id,holiday_date", ignoreDuplicates: true }).select("id");
  if (error) return { added: 0, error: "Couldn't add the holidays." };
  return { added: data?.length ?? 0, error: null };
}
