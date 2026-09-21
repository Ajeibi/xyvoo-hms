import type { SupabaseClient } from "@supabase/supabase-js";

/** Per-user read state for hotel.notifications — see notification_reads migration. */
export async function getReadNotificationIds(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
  notificationIds: string[],
): Promise<Set<string>> {
  if (notificationIds.length === 0) return new Set();
  const { data } = await service
    .schema("hotel")
    .from("notification_reads")
    .select("notification_id")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .in("notification_id", notificationIds);
  return new Set((data ?? []).map((r) => r.notification_id as string));
}

export async function markNotificationRead(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
  notificationId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await service
    .schema("hotel")
    .from("notification_reads")
    .upsert(
      { tenant_id: tenantId, notification_id: notificationId, user_id: userId, read_at: new Date().toISOString() },
      { onConflict: "notification_id,user_id" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markNotificationsRead(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
  notificationIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  if (notificationIds.length === 0) return { ok: true };
  const rows = notificationIds.map((id) => ({
    tenant_id: tenantId,
    notification_id: id,
    user_id: userId,
    read_at: new Date().toISOString(),
  }));
  const { error } = await service
    .schema("hotel")
    .from("notification_reads")
    .upsert(rows, { onConflict: "notification_id,user_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
