import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { setRoomStatus } from "@/lib/hms/room-status";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Actor = { userId: string | null; name: string | null };

async function logEvent(service: SupabaseClient, tenantId: string, workOrderId: string, body: string, actor: Actor) {
  await service.schema("hotel").from("maintenance_work_order_events").insert({
    tenant_id: tenantId,
    work_order_id: workOrderId,
    kind: "room",
    body,
    actor_user_id: actor.userId,
    actor_name: actor.name,
  });
}

/**
 * Takes the work order's room out of order. It makes a real room block (the same table the front
 * desk's Block button writes, so availability, reservations and the channel feed all see it) and
 * sets the room to out of order. Refuses while a guest is in the room.
 */
export async function takeRoomOutOfOrder(
  service: SupabaseClient,
  tenantId: string,
  workOrderId: string,
  actor: Actor,
  opts?: { expectedBackAt?: string | null },
): Promise<{ error: string | null }> {
  const { data: wo } = await service.schema("hotel").from("maintenance_work_orders").select("*").eq("tenant_id", tenantId).eq("id", workOrderId).maybeSingle();
  if (!wo) return { error: "Work order not found." };
  if (!wo.room_unit_id) return { error: "This order isn't for a room." };
  if (["completed", "cancelled"].includes(wo.status as string)) return { error: "This order is closed." };
  if (wo.room_block_id) return { error: "This room is already out of order for this work order." };

  const { data: unit } = await service.schema("hotel").from("room_units").select("room_code, status").eq("tenant_id", tenantId).eq("id", wo.room_unit_id).maybeSingle();
  if (!unit) return { error: "Room not found." };
  if (unit.status === "occupied") return { error: `Room ${unit.room_code} has a guest in it. Move the guest to another room first.` };

  let endAt: string | null = null;
  if (opts?.expectedBackAt) {
    const d = new Date(opts.expectedBackAt);
    if (Number.isNaN(d.getTime())) return { error: "That date isn't valid." };
    endAt = d.toISOString();
  }

  const { data: block, error } = await service
    .schema("hotel")
    .from("room_blocks")
    .insert({
      tenant_id: tenantId,
      room_unit_id: wo.room_unit_id,
      block_type: "maintenance_hold",
      reason: `${wo.wo_number}: ${wo.title}`.slice(0, 200),
      start_at: new Date().toISOString(),
      end_at: endAt,
      notes: `Raised by maintenance work order ${wo.wo_number}.`,
      created_by: actor.userId,
      active: true,
    })
    .select("id")
    .single();
  if (error || !block) return { error: error?.message ?? "Could not block the room." };

  const status = await setRoomStatus(service, {
    tenantId,
    roomUnitId: wo.room_unit_id as string,
    status: "out_of_order",
    actorUserId: actor.userId,
    roomCode: unit.room_code as string,
    previousStatus: unit.status as string,
  });
  if (!status.ok) {
    await service.schema("hotel").from("room_blocks").update({ active: false }).eq("id", block.id);
    return { error: status.error };
  }

  await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .update({ room_block_id: block.id, took_room_out_of_order: true, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", workOrderId);
  await logEvent(service, tenantId, workOrderId, `Room ${unit.room_code} taken out of order`, actor);
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "room_blocked",
    entityType: "room_unit",
    entityId: wo.room_unit_id as string,
    after: { blockId: block.id, blockType: "maintenance_hold", reason: wo.title, workOrder: wo.wo_number },
  });
  await emitNotification({
    tenantId,
    type: "room_blocked",
    title: "Room out of order",
    body: `Room ${unit.room_code}: ${wo.title} (${wo.wo_number})`,
    severity: "warning",
    entityType: "room_unit",
    entityId: wo.room_unit_id as string,
  });
  return { error: null };
}

/**
 * Lifts the order's room block when the order is completed or cancelled. The room goes back as
 * "dirty" so housekeeping cleans it, the same as the front desk's own Unblock. It stays out of
 * order if some other block is still active on the room.
 */
export async function releaseRoomForOrder(
  service: SupabaseClient,
  tenantId: string,
  workOrderId: string,
  actor: Actor,
): Promise<{ released: boolean }> {
  const { data: wo } = await service.schema("hotel").from("maintenance_work_orders").select("room_unit_id, room_block_id, wo_number").eq("tenant_id", tenantId).eq("id", workOrderId).maybeSingle();
  if (!wo?.room_block_id || !wo.room_unit_id) return { released: false };

  const { data: block } = await service.schema("hotel").from("room_blocks").select("id, active, block_type").eq("tenant_id", tenantId).eq("id", wo.room_block_id).maybeSingle();
  if (!block || !block.active) {
    // The front desk already lifted it.
    await service.schema("hotel").from("maintenance_work_orders").update({ room_block_id: null }).eq("id", workOrderId);
    return { released: false };
  }

  await service.schema("hotel").from("room_blocks").update({ active: false, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", block.id);
  await service.schema("hotel").from("maintenance_work_orders").update({ room_block_id: null }).eq("id", workOrderId);

  const { count: stillBlocked } = await service
    .schema("hotel")
    .from("room_blocks")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("room_unit_id", wo.room_unit_id)
    .eq("active", true)
    .neq("block_type", "soft");

  const { data: unit } = await service.schema("hotel").from("room_units").select("room_code, status").eq("id", wo.room_unit_id).maybeSingle();
  if (unit && (stillBlocked ?? 0) === 0 && unit.status === "out_of_order") {
    await setRoomStatus(service, {
      tenantId,
      roomUnitId: wo.room_unit_id as string,
      status: "dirty",
      actorUserId: actor.userId,
      roomCode: unit.room_code as string,
      previousStatus: unit.status as string,
    });
  }
  await logEvent(
    service,
    tenantId,
    workOrderId,
    (stillBlocked ?? 0) > 0 ? "Block lifted (another block still holds the room)" : `Room ${unit?.room_code ?? ""} released to housekeeping`,
    actor,
  );
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "room_unblocked",
    entityType: "room_unit",
    entityId: wo.room_unit_id as string,
    after: { blockId: block.id, workOrder: wo.wo_number },
  });
  return { released: true };
}

export type BlockedRoomWithoutOrder = {
  blockId: string;
  roomUnitId: string;
  roomCode: string;
  blockType: string;
  reason: string;
  since: string;
  endAt: string | null;
};

/** Rooms the front desk blocked that have no work order, so nobody is on the repair. */
export async function listBlockedRoomsWithoutOrder(service: SupabaseClient, tenantId: string): Promise<BlockedRoomWithoutOrder[]> {
  const { data: blocks } = await service
    .schema("hotel")
    .from("room_blocks")
    .select("id, room_unit_id, block_type, reason, start_at, end_at")
    .eq("tenant_id", tenantId)
    .eq("active", true)
    .neq("block_type", "soft");
  const list = (blocks ?? []) as any[];
  if (list.length === 0) return [];
  const [{ data: linked }, { data: units }] = await Promise.all([
    service.schema("hotel").from("maintenance_work_orders").select("room_block_id").eq("tenant_id", tenantId).in("room_block_id", list.map((b) => b.id)),
    service.schema("hotel").from("room_units").select("id, room_code").eq("tenant_id", tenantId).in("id", [...new Set(list.map((b) => b.room_unit_id))]),
  ]);
  const linkedIds = new Set((linked ?? []).map((l: any) => l.room_block_id as string));
  const codes = new Map((units ?? []).map((u: any) => [u.id as string, u.room_code as string]));
  return list
    .filter((b) => !linkedIds.has(b.id))
    .map((b) => ({
      blockId: b.id,
      roomUnitId: b.room_unit_id,
      roomCode: codes.get(b.room_unit_id) ?? "?",
      blockType: b.block_type,
      reason: b.reason,
      since: b.start_at,
      endAt: b.end_at ?? null,
    }))
    .sort((a, b) => a.roomCode.localeCompare(b.roomCode, undefined, { numeric: true }));
}

/** Attaches an existing front desk block to a work order, so completing the order lifts it. */
export async function adoptBlock(
  service: SupabaseClient,
  tenantId: string,
  workOrderId: string,
  blockId: string,
  actor: Actor,
): Promise<{ error: string | null }> {
  const { data: wo } = await service.schema("hotel").from("maintenance_work_orders").select("room_unit_id, room_block_id").eq("tenant_id", tenantId).eq("id", workOrderId).maybeSingle();
  if (!wo) return { error: "Work order not found." };
  if (wo.room_block_id) return { error: "This order already holds a room block." };
  const { data: block } = await service.schema("hotel").from("room_blocks").select("id, room_unit_id, active").eq("tenant_id", tenantId).eq("id", blockId).maybeSingle();
  if (!block || !block.active) return { error: "That block is no longer active." };
  if (block.room_unit_id !== wo.room_unit_id) return { error: "That block is on a different room." };
  const { error } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .update({ room_block_id: blockId, took_room_out_of_order: true, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", workOrderId);
  if (error) return { error: error.message };
  await logEvent(service, tenantId, workOrderId, "Linked to the room block already placed by the front desk", actor);
  return { error: null };
}
