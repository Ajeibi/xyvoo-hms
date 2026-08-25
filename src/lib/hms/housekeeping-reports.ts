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
    .select("id,status,started_at,completed_at,inspection_result,assigned_note,created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", startIso);

  const tasks = (rows ?? []) as {
    id: string;
    status: string;
    started_at: string | null;
    completed_at: string | null;
    inspection_result: string | null;
    assigned_note: string | null;
    created_at: string;
  }[];

  const cleanDurations: number[] = [];
  let passCount = 0;
  let failCount = 0;
  const roomsByAssignee = new Map<string, number>();

  for (const t of tasks) {
    if (t.started_at && t.completed_at) {
      cleanDurations.push((new Date(t.completed_at).getTime() - new Date(t.started_at).getTime()) / 60000);
    }
    if (t.inspection_result === "pass") passCount += 1;
    if (t.inspection_result === "fail") failCount += 1;
    if (t.completed_at && t.assigned_note) {
      roomsByAssignee.set(t.assigned_note, (roomsByAssignee.get(t.assigned_note) ?? 0) + 1);
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
    perAttendant: [...roomsByAssignee.entries()]
      .map(([name, roomsCleaned]) => ({ name, roomsCleaned }))
      .sort((a, b) => b.roomsCleaned - a.roomsCleaned),
  };
}
