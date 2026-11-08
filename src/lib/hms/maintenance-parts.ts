import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postStockMovement } from "@/lib/hms/inventory-stock";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { addEvent, type Actor } from "@/lib/hms/maintenance-orders";

/* eslint-disable @typescript-eslint/no-explicit-any */

const round2 = (v: number) => Math.round(v * 100) / 100;
const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

async function refreshPartsCost(service: SupabaseClient, tenantId: string, workOrderId: string) {
  const { data } = await service.schema("hotel").from("maintenance_work_order_parts").select("qty, unit_cost").eq("work_order_id", workOrderId);
  const total = round2((data ?? []).reduce((s: number, p: any) => s + num(p.qty) * num(p.unit_cost), 0));
  await service.schema("hotel").from("maintenance_work_orders").update({ parts_cost: total, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", workOrderId);
  return total;
}

/**
 * Takes a part out of stock for a work order. Stock goes down through the one stock function,
 * and the cost is booked to Repairs & Maintenance (5300) against Inventory (1400), so the books
 * and the stock room always agree. Nothing is saved if either account is missing.
 */
export async function issuePart(
  service: SupabaseClient,
  tenantId: string,
  workOrderId: string,
  input: { itemId: string; locationId: string; qty: number },
  actor: Actor,
): Promise<{ error: string | null }> {
  if (!Number.isFinite(input.qty) || input.qty <= 0) return { error: "Enter how many were used." };
  const { data: wo } = await service.schema("hotel").from("maintenance_work_orders").select("id, wo_number, title, status").eq("tenant_id", tenantId).eq("id", workOrderId).maybeSingle();
  if (!wo) return { error: "Work order not found." };
  if (wo.status === "cancelled") return { error: "This order was cancelled." };

  const { data: item } = await service.schema("hotel").from("inventory_items").select("id, name, unit_of_measure").eq("tenant_id", tenantId).eq("id", input.itemId).maybeSingle();
  if (!item) return { error: "That stock item isn't in this hotel." };
  const { data: loc } = await service.schema("hotel").from("inventory_locations").select("id, name").eq("tenant_id", tenantId).eq("id", input.locationId).maybeSingle();
  if (!loc) return { error: "That store isn't in this hotel." };

  const [expenseId, inventoryId] = await Promise.all([getAccountIdByCode(service, tenantId, "5300"), getAccountIdByCode(service, tenantId, "1400")]);
  if (!expenseId || !inventoryId) return { error: "Repairs & Maintenance (5300) and Inventory (1400) must be in your chart of accounts first." };

  const moved = await postStockMovement(service, {
    tenantId,
    itemId: input.itemId,
    locationId: input.locationId,
    movementType: "issue",
    qty: -Math.abs(input.qty),
    referenceType: "maintenance_work_order",
    referenceId: workOrderId,
    reason: `Maintenance ${wo.wo_number}`,
    performedBy: actor.userId ?? "system",
    note: wo.title as string,
  });
  if (moved.error || !moved.movement) return { error: moved.error ?? "Could not take the part out of stock." };

  const unitCost = num(moved.movement.unit_cost_at_movement);
  const value = round2(Math.abs(input.qty) * unitCost);
  let journalId: string | null = null;
  if (value > 0) {
    const je = await postJournalEntry(service, {
      tenantId,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: `Maintenance parts: ${wo.wo_number}`,
      reference: workOrderId,
      createdBy: actor.userId ?? "system",
      lines: [
        { accountId: expenseId, department: "Engineering", debit: value, credit: 0 },
        { accountId: inventoryId, department: "Engineering", debit: 0, credit: value },
      ],
    });
    if (!je.ok) {
      // Put the stock back so the books and the store still agree.
      await postStockMovement(service, {
        tenantId,
        itemId: input.itemId,
        locationId: input.locationId,
        movementType: "adjustment",
        qty: Math.abs(input.qty),
        unitCost,
        referenceType: "maintenance_work_order",
        referenceId: workOrderId,
        reason: "Undo: could not book the cost",
        performedBy: actor.userId ?? "system",
      });
      return { error: `Could not book the cost: ${je.error}` };
    }
    journalId = je.id;
  }

  await service.schema("hotel").from("maintenance_work_order_parts").insert({
    tenant_id: tenantId,
    work_order_id: workOrderId,
    item_id: input.itemId,
    location_id: input.locationId,
    description: item.name as string,
    qty: Math.abs(input.qty),
    unit_cost: unitCost,
    movement_id: moved.movement.id,
    journal_entry_id: journalId,
    issued_by: actor.userId,
  });
  await refreshPartsCost(service, tenantId, workOrderId);
  await addEvent(service, tenantId, workOrderId, "part", `${Math.abs(input.qty)} × ${item.name} from ${loc.name} (${value.toFixed(2)})`, actor);
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "work_order_part_issued",
    entityType: "maintenance_work_order",
    entityId: workOrderId,
    after: { itemId: input.itemId, qty: input.qty, value },
  });
  return { error: null };
}

/** Puts an unused part back in the store and reverses its cost. */
export async function returnPart(service: SupabaseClient, tenantId: string, partId: string, actor: Actor): Promise<{ error: string | null }> {
  const { data: part } = await service.schema("hotel").from("maintenance_work_order_parts").select("*").eq("tenant_id", tenantId).eq("id", partId).maybeSingle();
  if (!part) return { error: "Part not found." };
  const [expenseId, inventoryId] = await Promise.all([getAccountIdByCode(service, tenantId, "5300"), getAccountIdByCode(service, tenantId, "1400")]);
  if (!expenseId || !inventoryId) return { error: "Repairs & Maintenance (5300) and Inventory (1400) must be in your chart of accounts first." };

  if (part.item_id && part.location_id) {
    const back = await postStockMovement(service, {
      tenantId,
      itemId: part.item_id as string,
      locationId: part.location_id as string,
      movementType: "adjustment",
      qty: Math.abs(num(part.qty)),
      unitCost: num(part.unit_cost),
      referenceType: "maintenance_work_order",
      referenceId: part.work_order_id as string,
      reason: "Part returned from maintenance work order",
      performedBy: actor.userId ?? "system",
    });
    if (back.error) return { error: back.error };
  }
  const value = round2(num(part.qty) * num(part.unit_cost));
  if (value > 0) {
    const je = await postJournalEntry(service, {
      tenantId,
      entryDate: new Date().toISOString().slice(0, 10),
      memo: "Maintenance parts returned to stock",
      reference: part.work_order_id as string,
      createdBy: actor.userId ?? "system",
      lines: [
        { accountId: inventoryId, department: "Engineering", debit: value, credit: 0 },
        { accountId: expenseId, department: "Engineering", debit: 0, credit: value },
      ],
    });
    if (!je.ok) {
      if (part.item_id && part.location_id) {
        await postStockMovement(service, {
          tenantId,
          itemId: part.item_id as string,
          locationId: part.location_id as string,
          movementType: "adjustment",
          qty: -Math.abs(num(part.qty)),
          unitCost: num(part.unit_cost),
          referenceType: "maintenance_work_order",
          referenceId: part.work_order_id as string,
          reason: "Undo: could not reverse the cost",
          performedBy: actor.userId ?? "system",
        });
      }
      return { error: `Could not reverse the cost: ${je.error}` };
    }
  }
  await service.schema("hotel").from("maintenance_work_order_parts").delete().eq("id", partId);
  await refreshPartsCost(service, tenantId, part.work_order_id as string);
  await addEvent(service, tenantId, part.work_order_id as string, "part", `Returned ${num(part.qty)} × ${part.description} to the store`, actor);
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "work_order_part_returned",
    entityType: "maintenance_work_order",
    entityId: part.work_order_id as string,
    after: { partId, value },
  });
  return { error: null };
}

export async function setLabour(service: SupabaseClient, tenantId: string, workOrderId: string, minutes: number, actor: Actor): Promise<{ error: string | null }> {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 100000) return { error: "Enter labour time in minutes." };
  const { error } = await service
    .schema("hotel")
    .from("maintenance_work_orders")
    .update({ labour_minutes: Math.round(minutes), updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", workOrderId);
  if (error) return { error: error.message };
  await addEvent(service, tenantId, workOrderId, "labour", `Labour set to ${Math.round(minutes)} minutes`, actor);
  return { error: null };
}
