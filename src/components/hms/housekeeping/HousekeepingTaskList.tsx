import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HousekeepingTaskListClient, type HkTaskRow } from "./HousekeepingTaskListClient";

export async function HousekeepingTaskList({
  tenantId,
  slug,
}: {
  tenantId: string;
  slug: string;
}) {
  const supabase = createServerSupabaseClient();
  const { data: tasks } = await supabase
    .schema("hotel")
    .from("housekeeping_tasks")
    .select("id,status,room_unit_id,started_at,completed_at,inspected_at,assigned_staff_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(50);

  const roomIds = [...new Set((tasks ?? []).map((t) => t.room_unit_id))];
  const roomCodeById = new Map<string, string>();
  if (roomIds.length > 0) {
    const { data: units } = await supabase
      .schema("hotel")
      .from("room_units")
      .select("id,room_code")
      .in("id", roomIds);
    for (const u of units ?? []) roomCodeById.set(u.id, u.room_code);
  }

  const rows: HkTaskRow[] = (tasks ?? []).map((t) => ({
    id: t.id,
    roomCode: roomCodeById.get(t.room_unit_id) ?? "—",
    status: t.status,
    startedAt: t.started_at,
    completedAt: t.completed_at,
    inspectedAt: t.inspected_at,
    assignedStaffId: t.assigned_staff_id,
  }));

  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-900">Active tasks</h2>
      </div>
      <HousekeepingTaskListClient slug={slug} tasks={rows} />
    </div>
  );
}
