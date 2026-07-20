import type { SupabaseClient } from "@supabase/supabase-js";

export type HousekeepingDailyReport = {
  tasksCreatedToday: number;
  tasksCompletedToday: number;
  averageCleanMinutes: number | null;
  inspectionPassRate: number | null;
  perAttendant: { name: string; roomsCleaned: number }[];
};

export async function getHousekeepingDailyReport(
  service: SupabaseClient,
  tenantId: string,
): Promise<HousekeepingDailyReport> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startIso = startOfDay.toISOString();

  const { data: rows } = await service
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id,status,started_at,completed_at,inspection_result,assigned_staff_id,created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso);

  const tasks = (rows ?? []) as {
    id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    inspection_result: string | null;
    assigned_staff_id: string | null;
    created_at: string;
  }[];

  const cleanDurations: number[] = [];
  let passCount = 0;
  let failCount = 0;
  const roomsByStaff = new Map<string, number>();

  for (const t of tasks) {
    if (t.started_at && t.completed_at) {
      cleanDurations.push((new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 60000);
    }
    if (t.inspection_result === "pass") passCount += 1;
    if (t.inspection_result === "fail") failCount += 1;
    if (t.completed_at && t.assigned_staff_id) {
      roomsByStaff.set(t.assigned_staff_id, (roomsByStaff.get(t.assigned_staff_id) ?? 0) + 1);
    }
  }

  const staffIds = [...roomsByStaff.keys()];
  const nameByUserId = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: profiles } = await service
      .schema("hotel")
      .from("profiles")
      .select("user_id,contact_name")
      .eq("tenant_id", tenantId)
      .in("user_id", staffIds);
    for (const p of (profiles ?? []) as { user_id: string; contact_name: string | null }[]) {
      if (p.contact_name) nameByUserId.set(p.user_id, p.contact_name);
    }
  }

  return {
    tasksCreatedToday: tasks.length,
    tasksCompletedToday: tasks.filter((t) => t.status === "ready").length,
    averageCleanMinutes:
      cleanDurations.length > 0
        ? Math.round(cleanDurations.reduce((a, b) => a + b, 0) / cleanDurations.length)
        : null,
    inspectionPassRate: passCount + failCount > 0 ? Math.round((passCount / (passCount + failCount)) * 100) : null,
    perAttendant: [...roomsByStaff.entries()]
      .map(([userId, roomsCleaned]) => ({ name: nameByUserId.get(userId) ?? "Staff", roomsCleaned }))
      .sort((a, b) => b.roomsCleaned - a.roomsCleaned),
  };
}
