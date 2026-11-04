import type { SupabaseClient } from "@supabase/supabase-js";
import { ALERT_GROUPS, type AlertGroup } from "@/lib/hms/notification-catalogue";

/** Where an alert can reach a person. Email, WhatsApp and push arrive in later steps; the choice is stored now. */
export const ALERT_CHANNELS = ["in_app", "email", "whatsapp", "push"] as const;
export type AlertChannel = (typeof ALERT_CHANNELS)[number];

export type GroupChoice = Record<AlertChannel, boolean>;
export type AlertChoices = Record<AlertGroup, GroupChoice>;

/** What a person gets until they choose otherwise: everything in the app, nothing elsewhere. */
export const DEFAULT_CHOICE: GroupChoice = { in_app: true, email: false, whatsapp: false, push: false };

export function defaultChoices(): AlertChoices {
  return Object.fromEntries(ALERT_GROUPS.map((g) => [g.key, { ...DEFAULT_CHOICE }])) as AlertChoices;
}

type PrefRow = { category: string; in_app: boolean; email: boolean; whatsapp: boolean; push: boolean };

/** Merges saved rows over a base (the built-in defaults unless given another). */
export function applyChoices(rows: PrefRow[] | null | undefined, base: AlertChoices = defaultChoices()): AlertChoices {
  const choices = Object.fromEntries(ALERT_GROUPS.map((g) => [g.key, { ...base[g.key] }])) as AlertChoices;
  for (const r of rows ?? []) {
    const group = choices[r.category as AlertGroup];
    if (!group) continue;
    group.in_app = r.in_app;
    group.email = r.email;
    group.whatsapp = r.whatsapp;
    group.push = r.push;
  }
  return choices;
}

/** The hotel's own defaults (set by an owner or admin), layered over the built-in ones. */
export async function getHotelDefaults(service: SupabaseClient, tenantId: string): Promise<AlertChoices> {
  const { data, error } = await service
    .schema("hotel")
    .from("notification_defaults")
    .select("category,in_app,email,whatsapp,push")
    .eq("tenant_id", tenantId);
  return error ? defaultChoices() : applyChoices(data as PrefRow[]);
}

/** Built-in defaults, then the hotel's defaults, then this person's own choices. */
export async function getAlertChoices(service: SupabaseClient, tenantId: string, userId: string): Promise<AlertChoices> {
  const { data, error } = await service
    .schema("hotel")
    .from("notification_preferences")
    .select("category,in_app,email,whatsapp,push")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId);
  const base = await getHotelDefaults(service, tenantId);
  // Until the migration has run there is no table: everyone keeps the defaults.
  if (error) return base;
  return applyChoices(data as PrefRow[], base);
}

/** Saves a person's choices, or the hotel's defaults when `userId` is null. */
export async function saveAlertChoices(
  service: SupabaseClient,
  tenantId: string,
  userId: string | null,
  choices: AlertChoices,
): Promise<{ ok: boolean; error?: string }> {
  const rows = ALERT_GROUPS.map((g) => ({
    tenant_id: tenantId,
    ...(userId ? { user_id: userId } : {}),
    category: g.key,
    ...choices[g.key],
    updated_at: new Date().toISOString(),
  }));
  const { error } = await service
    .schema("hotel")
    .from(userId ? "notification_preferences" : "notification_defaults")
    .upsert(rows, { onConflict: userId ? "tenant_id,user_id,category" : "tenant_id,category" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Groups this person has switched off in the app. Critical alerts still show (see `hideMutedFilter`). */
export async function mutedInAppGroups(service: SupabaseClient, tenantId: string, userId: string): Promise<AlertGroup[]> {
  const choices = await getAlertChoices(service, tenantId, userId);
  return ALERT_GROUPS.filter((g) => !choices[g.key].in_app).map((g) => g.key);
}

/**
 * A Postgrest `.or()` filter that drops muted groups from a notifications query, or null when
 * nothing is muted. Alerts with no category (raised before categories existed) and critical
 * alerts always show.
 */
export function hideMutedFilter(muted: AlertGroup[]): string | null {
  if (muted.length === 0) return null;
  return `category.is.null,severity.eq.critical,category.not.in.(${muted.join(",")})`;
}
