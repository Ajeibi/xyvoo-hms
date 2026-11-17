import type { SupabaseClient } from "@supabase/supabase-js";
import { listOpenHousekeepingTasks } from "@/lib/hms/housekeeping-tasks";

/*
 * What has been given to one person. Housekeeping tasks and guest requests carry the login they
 * were assigned to; this reads them back for that person ("My work") and counts them per person
 * for a head of department's team view.
 */

export type MyWorkItem = {
  kind: "housekeeping" | "guest_request";
  id: string;
  title: string;
  detail: string;
  status: string;
  priority: string | null;
  dueAt: string | null;
  href: string;
};

const TERMINAL_REQUEST = ["completed", "cancelled"];

export async function listMyWork(service: SupabaseClient, tenantId: string, slug: string, userId: string): Promise<MyWorkItem[]> {
  const [tasks, requests] = await Promise.all([
    listOpenHousekeepingTasks(service, tenantId).catch(() => []),
    service
      .schema("hotel")
      .from("guest_requests")
      .select("id,request_type,details,status,priority,expected_completed_at,room_unit_id")
      .eq("tenant_id", tenantId)
      .eq("assigned_user_id", userId)
      .not("status", "in", `(${TERMINAL_REQUEST.join(",")})`)
      .order("created_at", { ascending: true })
      .limit(100),
  ]);

  const roomIds = [...new Set((requests.data ?? []).map((r) => r.room_unit_id as string | null).filter((x): x is string => Boolean(x)))];
  const rooms = new Map<string, string>();
  if (roomIds.length) {
    const { data } = await service.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", tenantId).in("id", roomIds);
    for (const r of data ?? []) rooms.set(r.id as string, r.room_code as string);
  }

  const items: MyWorkItem[] = [];
  for (const t of tasks.filter((x) => x.assignedStaffId === userId)) {
    items.push({
      kind: "housekeeping",
      id: t.id,
      title: `Room ${t.roomCode}`,
      detail: t.taskType.replace(/_/g, " "),
      status: t.status,
      priority: t.priorityLevel,
      dueAt: t.dueBy,
      href: `/hms/${slug}/housekeeping/my-tasks`,
    });
  }
  for (const r of requests.data ?? []) {
    const room = r.room_unit_id ? rooms.get(r.room_unit_id as string) : null;
    items.push({
      kind: "guest_request",
      id: r.id as string,
      title: `${String(r.request_type ?? "Guest request").replace(/_/g, " ")}${room ? `, room ${room}` : ""}`,
      detail: (r.details as string | null)?.trim() || "",
      status: r.status as string,
      priority: (r.priority as string | null) ?? null,
      dueAt: (r.expected_completed_at as string | null) ?? null,
      href: `/hms/${slug}/frontdesk/guest-services`,
    });
  }
  return items;
}

export type PersonWorkload = { userId: string; housekeeping: number; guestRequests: number; actionsLast7Days: number; lastActionAt: string | null };

/** Open items and recent actions per person, for a head of department's team view. */
export async function teamWorkload(service: SupabaseClient, tenantId: string, userIds: string[], now = new Date()): Promise<Map<string, PersonWorkload>> {
  const out = new Map<string, PersonWorkload>(userIds.map((id) => [id, { userId: id, housekeeping: 0, guestRequests: 0, actionsLast7Days: 0, lastActionAt: null }]));
  if (userIds.length === 0) return out;
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();

  const [tasks, requests, audit] = await Promise.all([
    service.schema("hotel").from("housekeeping_tasks").select("assigned_staff_id").eq("tenant_id", tenantId).neq("status", "ready").in("assigned_staff_id", userIds),
    service
      .schema("hotel")
      .from("guest_requests")
      .select("assigned_user_id")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${TERMINAL_REQUEST.join(",")})`)
      .in("assigned_user_id", userIds),
    service.schema("hotel").from("audit_logs").select("actor_user_id,created_at").eq("tenant_id", tenantId).in("actor_user_id", userIds).gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
  ]);
  for (const t of tasks.data ?? []) {
    const w = out.get(t.assigned_staff_id as string);
    if (w) w.housekeeping += 1;
  }
  for (const r of requests.data ?? []) {
    const w = out.get(r.assigned_user_id as string);
    if (w) w.guestRequests += 1;
  }
  for (const a of audit.data ?? []) {
    const w = out.get(a.actor_user_id as string);
    if (!w) continue;
    w.actionsLast7Days += 1;
    if (!w.lastActionAt) w.lastActionAt = a.created_at as string;
  }
  return out;
}
