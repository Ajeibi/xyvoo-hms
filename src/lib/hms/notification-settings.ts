import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/** A person's contact number, quiet hours and daily summary. */
export type NotificationUserSettings = {
  whatsappNumber: string | null;
  quietEnabled: boolean;
  /** "HH:MM", in the hotel's time zone. */
  quietStart: string;
  quietEnd: string;
  /** Critical alerts still come through during quiet hours. */
  quietAllowCritical: boolean;
  dailySummary: boolean;
  /** Hour of the day (0-23, hotel time) the summary is sent. */
  summaryHour: number;
};

export const DEFAULT_USER_SETTINGS: NotificationUserSettings = {
  whatsappNumber: null,
  quietEnabled: false,
  quietStart: "22:00",
  quietEnd: "07:00",
  quietAllowCritical: true,
  dailySummary: false,
  summaryHour: 7,
};

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a time like 22:00.");

export const userSettingsSchema = z.object({
  whatsappNumber: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s()-]/g, ""))
    .refine((v) => v === "" || /^\+?\d{8,15}$/.test(v), "Enter the number with its country code, e.g. +2348012345678.")
    .transform((v) => (v === "" ? null : v.replace(/^\+/, "")))
    .nullable(),
  quietEnabled: z.boolean(),
  quietStart: hhmm,
  quietEnd: hhmm,
  quietAllowCritical: z.boolean(),
  dailySummary: z.boolean(),
  summaryHour: z.number().int().min(0).max(23),
});

type Row = {
  whatsapp_number: string | null;
  quiet_enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  quiet_allow_critical: boolean;
  daily_summary: boolean;
  summary_hour: number;
};

const toSettings = (r: Row): NotificationUserSettings => ({
  whatsappNumber: r.whatsapp_number,
  quietEnabled: r.quiet_enabled,
  quietStart: String(r.quiet_start).slice(0, 5),
  quietEnd: String(r.quiet_end).slice(0, 5),
  quietAllowCritical: r.quiet_allow_critical,
  dailySummary: r.daily_summary,
  summaryHour: r.summary_hour,
});

const COLUMNS = "whatsapp_number,quiet_enabled,quiet_start,quiet_end,quiet_allow_critical,daily_summary,summary_hour";

export async function getUserSettings(service: SupabaseClient, tenantId: string, userId: string): Promise<NotificationUserSettings> {
  const { data, error } = await service
    .schema("hotel")
    .from("notification_user_settings")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return !error && data ? toSettings(data as Row) : { ...DEFAULT_USER_SETTINGS };
}

/** Settings for several people at once, keyed by user id. People with no row get the defaults. */
export async function getUserSettingsFor(service: SupabaseClient, tenantId: string, userIds: string[]) {
  const out = new Map<string, NotificationUserSettings>();
  if (userIds.length === 0) return out;
  const { data } = await service
    .schema("hotel")
    .from("notification_user_settings")
    .select(`user_id,${COLUMNS}`)
    .eq("tenant_id", tenantId)
    .in("user_id", userIds);
  for (const r of (data ?? []) as (Row & { user_id: string })[]) out.set(r.user_id, toSettings(r));
  for (const id of userIds) if (!out.has(id)) out.set(id, { ...DEFAULT_USER_SETTINGS });
  return out;
}

export async function saveUserSettings(service: SupabaseClient, tenantId: string, userId: string, s: NotificationUserSettings) {
  const { error } = await service
    .schema("hotel")
    .from("notification_user_settings")
    .upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        whatsapp_number: s.whatsappNumber,
        quiet_enabled: s.quietEnabled,
        quiet_start: s.quietStart,
        quiet_end: s.quietEnd,
        quiet_allow_critical: s.quietAllowCritical,
        daily_summary: s.dailySummary,
        summary_hour: s.summaryHour,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,user_id" },
    );
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

/** Minutes since midnight, in `timeZone`, at `now`. */
export function minutesInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

const toMinutes = (hhmmText: string) => {
  const [h, m] = hhmmText.split(":").map(Number);
  return h * 60 + m;
};

/** Whether `now` falls inside the person's quiet hours (which may run past midnight). */
export function inQuietHours(s: Pick<NotificationUserSettings, "quietEnabled" | "quietStart" | "quietEnd">, now: Date, timeZone: string) {
  if (!s.quietEnabled) return false;
  const start = toMinutes(s.quietStart);
  const end = toMinutes(s.quietEnd);
  if (start === end) return false;
  const t = minutesInZone(now, timeZone);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

/** Whether an alert of this severity should be held back right now, for this person. */
export function shouldHoldAlert(
  s: NotificationUserSettings,
  severity: "info" | "warning" | "critical",
  now: Date,
  timeZone: string,
) {
  if (!inQuietHours(s, now, timeZone)) return false;
  return !(severity === "critical" && s.quietAllowCritical);
}
