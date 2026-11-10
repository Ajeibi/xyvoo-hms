import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAlert } from "@/lib/hms/alerts";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import type { HrActor } from "@/lib/hms/hr/hr-api";
import { employeeNames, mapShift } from "@/lib/hms/hr/hr-rota";
import { formatDay, friendlyDbError, isoToLocalTime, type Employee, type Shift, type SwapRequest, type SwapStatus } from "@/lib/hms/hr/hr-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function listSwaps(service: SupabaseClient, tenantId: string, opts: { statuses?: SwapStatus[]; employeeId?: string; limit?: number } = {}): Promise<SwapRequest[]> {
  let q = service.schema("hotel").from("hr_shift_swaps").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(opts.limit ?? 200);
  if (opts.statuses?.length) q = q.in("status", opts.statuses);
  if (opts.employeeId) q = q.or(`from_employee_id.eq.${opts.employeeId},to_employee_id.eq.${opts.employeeId}`);
  const { data } = await q;
  const rows = data ?? [];
  const shiftIds = [...new Set(rows.flatMap((r: any) => [r.shift_id, r.other_shift_id]).filter(Boolean))] as string[];
  const names = await employeeNames(service, tenantId);
  const { data: shifts } = shiftIds.length ? await service.schema("hotel").from("hr_shifts").select("*").eq("tenant_id", tenantId).in("id", shiftIds) : { data: [] as any[] };
  const shiftMap = new Map((shifts ?? []).map((s: any) => [s.id as string, mapShift(s, names)]));
  return rows.map((r: any) => ({
    id: r.id,
    kind: r.kind,
    status: r.status,
    shift: shiftMap.get(r.shift_id) ?? null,
    otherShift: r.other_shift_id ? (shiftMap.get(r.other_shift_id) ?? null) : null,
    fromEmployeeId: r.from_employee_id ?? null,
    fromName: r.from_employee_id ? (names.get(r.from_employee_id) ?? null) : null,
    toEmployeeId: r.to_employee_id ?? null,
    toName: r.to_employee_id ? (names.get(r.to_employee_id) ?? null) : null,
    note: r.note ?? null,
    decisionNote: r.decision_note ?? null,
    createdAt: r.created_at,
  }));
}

const describe = (s: Shift | null) => (s ? `${formatDay(s.shiftDate)} ${isoToLocalTime(s.startsAt)}–${isoToLocalTime(s.endsAt)}` : "a shift");

async function loadShift(service: SupabaseClient, tenantId: string, id: string) {
  const { data } = await service.schema("hotel").from("hr_shifts").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data as any | null;
}

const isFuturePublished = (s: any) => s && s.status === "published" && new Date(s.starts_at).getTime() > Date.now();

async function notifyManagers(tenantId: string, title: string, body: string, entityId: string) {
  await sendAlert({ tenantId, type: "hr_shift_swap", title, body, severity: "info", entityType: "hr_shift_swap", entityId, department: "hr" });
}

/* ---------- staff, from the clock screen ---------- */

export async function offerShift(service: SupabaseClient, tenantId: string, me: Employee, shiftId: string, toEmployeeId: string | null, note: string | null): Promise<{ error: string | null }> {
  const s = await loadShift(service, tenantId, shiftId);
  if (!s || s.employee_id !== me.id) return { error: "That isn't your shift." };
  if (!isFuturePublished(s)) return { error: "Only upcoming shifts on the published rota can be offered." };
  if (toEmployeeId === me.id) return { error: "Choose a colleague." };
  const { error } = await service.schema("hotel").from("hr_shift_swaps").insert({ tenant_id: tenantId, kind: "give_away", shift_id: shiftId, from_employee_id: me.id, to_employee_id: toEmployeeId, note: note?.trim() || null });
  return { error: error ? friendlyDbError(error.message) : null };
}

export async function requestSwap(service: SupabaseClient, tenantId: string, me: Employee, myShiftId: string, theirShiftId: string, note: string | null): Promise<{ error: string | null }> {
  const [mine, theirs] = await Promise.all([loadShift(service, tenantId, myShiftId), loadShift(service, tenantId, theirShiftId)]);
  if (!mine || mine.employee_id !== me.id) return { error: "That isn't your shift." };
  if (!theirs || !theirs.employee_id || theirs.employee_id === me.id) return { error: "Pick a colleague's shift." };
  if (!isFuturePublished(mine) || !isFuturePublished(theirs)) return { error: "Both shifts must be upcoming and on the published rota." };
  const { error } = await service.schema("hotel").from("hr_shift_swaps").insert({
    tenant_id: tenantId,
    kind: "swap",
    shift_id: myShiftId,
    other_shift_id: theirShiftId,
    from_employee_id: me.id,
    to_employee_id: theirs.employee_id,
    note: note?.trim() || null,
  });
  return { error: error ? friendlyDbError(error.message) : null };
}

export async function pickUpShift(service: SupabaseClient, tenantId: string, me: Employee, shiftId: string): Promise<{ error: string | null }> {
  const s = await loadShift(service, tenantId, shiftId);
  if (!s || s.employee_id) return { error: "That shift has already been taken." };
  if (!isFuturePublished(s)) return { error: "Only upcoming open shifts can be picked up." };
  const { data, error } = await service
    .schema("hotel")
    .from("hr_shift_swaps")
    .insert({ tenant_id: tenantId, kind: "pick_up", shift_id: shiftId, to_employee_id: me.id, status: "accepted" })
    .select("id")
    .single();
  if (error) return { error: friendlyDbError(error.message) };
  await notifyManagers(tenantId, "Open shift picked up", `${me.fullName} wants to take an open shift. Approve it on the Rota page.`, data.id);
  return { error: null };
}

export async function acceptSwap(service: SupabaseClient, tenantId: string, me: Employee, swapId: string): Promise<{ error: string | null }> {
  const { data: r } = await service.schema("hotel").from("hr_shift_swaps").select("*").eq("tenant_id", tenantId).eq("id", swapId).maybeSingle();
  if (!r || r.status !== "pending") return { error: "This request is no longer open." };
  if (r.from_employee_id === me.id) return { error: "You made this request." };
  if (r.to_employee_id && r.to_employee_id !== me.id) return { error: "This request is for someone else." };
  const { error } = await service.schema("hotel").from("hr_shift_swaps").update({ to_employee_id: me.id, status: "accepted" }).eq("id", swapId).eq("status", "pending");
  if (error) return { error: friendlyDbError(error.message) };
  await notifyManagers(tenantId, r.kind === "swap" ? "Shift swap agreed" : "Shift handover agreed", `${me.fullName} agreed to a ${r.kind === "swap" ? "swap" : "shift handover"}. It needs a manager's approval on the Rota page.`, swapId);
  return { error: null };
}

export async function cancelSwap(service: SupabaseClient, tenantId: string, me: Employee, swapId: string): Promise<{ error: string | null }> {
  const { data: r } = await service.schema("hotel").from("hr_shift_swaps").select("*").eq("tenant_id", tenantId).eq("id", swapId).maybeSingle();
  if (!r || !["pending", "accepted"].includes(r.status)) return { error: "This request is no longer open." };
  const mineToCancel = r.from_employee_id === me.id || (r.kind === "pick_up" && r.to_employee_id === me.id);
  if (!mineToCancel) {
    // A colleague who was asked can say no.
    if (r.to_employee_id === me.id && r.status === "pending") {
      await service.schema("hotel").from("hr_shift_swaps").update({ status: "declined", decision_note: "Declined by colleague" }).eq("id", swapId);
      return { error: null };
    }
    return { error: "You can't cancel this request." };
  }
  await service.schema("hotel").from("hr_shift_swaps").update({ status: "cancelled" }).eq("id", swapId);
  return { error: null };
}

/* ---------- managers ---------- */

async function onLeave(service: SupabaseClient, tenantId: string, employeeId: string, date: string) {
  const { data } = await service.schema("hotel").from("hr_leave_requests").select("id").eq("tenant_id", tenantId).eq("employee_id", employeeId).eq("status", "approved").lte("start_date", date).gte("end_date", date).limit(1);
  return Boolean(data?.length);
}

export async function decideSwap(service: SupabaseClient, tenantId: string, swapId: string, approve: boolean, note: string | null, actor: HrActor): Promise<{ error: string | null }> {
  const { data: r } = await service.schema("hotel").from("hr_shift_swaps").select("*").eq("tenant_id", tenantId).eq("id", swapId).maybeSingle();
  if (!r) return { error: "Request not found." };
  if (approve && r.status !== "accepted") return { error: "The colleague hasn't agreed yet." };
  if (!approve && !["pending", "accepted"].includes(r.status)) return { error: "This request is already closed." };

  if (approve) {
    const shift = await loadShift(service, tenantId, r.shift_id);
    if (!shift || shift.status === "cancelled") return { error: "The shift no longer exists." };
    if (await onLeave(service, tenantId, r.to_employee_id, shift.shift_date)) return { error: "The person taking the shift is on approved leave that day." };
    const shifts = service.schema("hotel").from("hr_shifts");
    const now = new Date().toISOString();
    if (r.kind === "swap") {
      const other = await loadShift(service, tenantId, r.other_shift_id);
      if (!other || other.status === "cancelled") return { error: "The other shift no longer exists." };
      if (shift.employee_id !== r.from_employee_id || other.employee_id !== r.to_employee_id) return { error: "The rota has changed since this was asked. Decline it and ask again." };
      if (await onLeave(service, tenantId, r.from_employee_id, other.shift_date)) return { error: "The person giving the shift is on approved leave on the other day." };
      // Free the first shift, move the second, then fill the first: the database checks each step for double booking.
      const a = await shifts.update({ employee_id: null, updated_at: now }).eq("id", shift.id);
      if (a.error) return { error: friendlyDbError(a.error.message) };
      const b = await shifts.update({ employee_id: r.from_employee_id, updated_at: now }).eq("id", other.id);
      if (b.error) {
        await shifts.update({ employee_id: r.from_employee_id }).eq("id", shift.id);
        return { error: friendlyDbError(b.error.message) };
      }
      const c = await shifts.update({ employee_id: r.to_employee_id, updated_at: now }).eq("id", shift.id);
      if (c.error) {
        await shifts.update({ employee_id: r.to_employee_id }).eq("id", other.id);
        await shifts.update({ employee_id: r.from_employee_id }).eq("id", shift.id);
        return { error: friendlyDbError(c.error.message) };
      }
    } else {
      if (r.kind === "pick_up" && shift.employee_id) return { error: "Someone else already has this shift." };
      if (r.kind === "give_away" && shift.employee_id !== r.from_employee_id) return { error: "The rota has changed since this was asked." };
      const u = await shifts.update({ employee_id: r.to_employee_id, updated_at: now }).eq("id", shift.id);
      if (u.error) return { error: friendlyDbError(u.error.message) };
    }
  }
  await service
    .schema("hotel")
    .from("hr_shift_swaps")
    .update({ status: approve ? "approved" : "declined", decision_note: note?.trim() || null, decided_by: actor.userId, decided_at: new Date().toISOString() })
    .eq("id", swapId);
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: approve ? "hr.swap.approved" : "hr.swap.declined", entityType: "hr_shift_swap", entityId: swapId, after: { kind: r.kind, from: r.from_employee_id, to: r.to_employee_id } });
  return { error: null };
}

/* ---------- what the clock screen shows ---------- */

export async function kioskSwapExtras(service: SupabaseClient, tenantId: string, me: Employee, myShifts: Shift[]) {
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const names = await employeeNames(service, tenantId);
  const [{ data: open }, { data: colleagues }, live] = await Promise.all([
    service.schema("hotel").from("hr_shifts").select("*").eq("tenant_id", tenantId).eq("status", "published").is("employee_id", null).gte("shift_date", today).lte("shift_date", in14).order("starts_at").limit(30),
    service.schema("hotel").from("hr_employees").select("id, first_name, last_name, preferred_name, department").eq("tenant_id", tenantId).eq("status", "active").neq("id", me.id),
    listSwaps(service, tenantId, { statuses: ["pending", "accepted"] }),
  ]);
  const sameDept = (colleagues ?? []).filter((c: any) => !me.department || c.department === me.department);
  const colleagueIds = new Set(sameDept.map((c: any) => c.id as string));
  const { data: theirShifts } = colleagueIds.size
    ? await service.schema("hotel").from("hr_shifts").select("*").eq("tenant_id", tenantId).eq("status", "published").in("employee_id", [...colleagueIds]).gte("shift_date", today).lte("shift_date", in14).order("starts_at").limit(100)
    : { data: [] as any[] };
  return {
    openShifts: (open ?? []).filter((s: any) => !me.department || !s.department || s.department === me.department).map((s: any) => mapShift(s, names)),
    colleagues: sameDept.map((c: any) => ({ id: c.id as string, name: `${c.preferred_name || c.first_name} ${c.last_name}` })),
    colleagueShifts: (theirShifts ?? []).filter((s: any) => new Date(s.starts_at).getTime() > Date.now()).map((s: any) => mapShift(s, names)),
    myRequests: live.filter((s) => s.fromEmployeeId === me.id || (s.kind === "pick_up" && s.toEmployeeId === me.id)),
    forMe: live.filter((s) => s.status === "pending" && s.fromEmployeeId !== me.id && (s.toEmployeeId === me.id || (s.kind === "give_away" && !s.toEmployeeId && (!me.department || s.shift?.department === me.department || !s.shift?.department)))),
    offerable: myShifts.filter((s) => new Date(s.startsAt).getTime() > Date.now()).map((s) => ({ id: s.id, label: describe(s) })),
  };
}
