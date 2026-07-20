import type { SupabaseClient } from "@supabase/supabase-js";
import type { QualityChecklistWithItemType } from "@/lib/hms/procurement-types";

export async function listQualityChecklists(supabase: SupabaseClient, tenantId: string): Promise<QualityChecklistWithItemType[]> {
  const { data } = await supabase.schema("hotel").from("procurement_quality_checklists").select("*").eq("tenant_id", tenantId);
  const rows = data ?? [];
  const itemTypeIds = [...new Set(rows.map((r) => r.item_type_id as string))];
  const { data: itemTypes } = itemTypeIds.length
    ? await supabase.schema("hotel").from("inventory_item_types").select("id,name").eq("tenant_id", tenantId).in("id", itemTypeIds)
    : { data: [] };
  const nameById = new Map((itemTypes ?? []).map((t) => [t.id as string, t.name as string]));

  return rows.map((r) => ({
    id: r.id as string,
    tenant_id: r.tenant_id as string,
    item_type_id: r.item_type_id as string,
    checklist_items: Array.isArray(r.checklist_items) ? (r.checklist_items as string[]) : [],
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    item_type_name: nameById.get(r.item_type_id as string) ?? "Unknown item type",
  }));
}

export async function upsertQualityChecklist(
  supabase: SupabaseClient,
  params: { tenantId: string; itemTypeId: string; checklistItems: string[] },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("procurement_quality_checklists")
    .upsert(
      {
        tenant_id: params.tenantId,
        item_type_id: params.itemTypeId,
        checklist_items: params.checklistItems.map((i) => i.trim()).filter(Boolean),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id,item_type_id" },
    )
    .select("*")
    .single();
  if (error || !data) return { checklist: null, error: error?.message ?? "Could not save checklist." };
  return {
    checklist: {
      id: data.id as string,
      tenant_id: data.tenant_id as string,
      item_type_id: data.item_type_id as string,
      checklist_items: Array.isArray(data.checklist_items) ? (data.checklist_items as string[]) : [],
      created_at: data.created_at as string,
      updated_at: data.updated_at as string,
    },
    error: null,
  };
}

export async function deleteQualityChecklist(supabase: SupabaseClient, tenantId: string, id: string) {
  const { error } = await supabase.schema("hotel").from("procurement_quality_checklists").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  return { error: null };
}

/** Resolves each item's configured quality checklist (via its item type) for the receiving form — empty array when none is configured. */
export async function getChecklistItemsByItemId(
  supabase: SupabaseClient,
  tenantId: string,
  itemIds: string[],
): Promise<Record<string, string[]>> {
  const uniqueIds = [...new Set(itemIds)];
  if (!uniqueIds.length) return {};

  const { data: items } = await supabase.schema("hotel").from("inventory_items").select("id,item_type").eq("tenant_id", tenantId).in("id", uniqueIds);
  const itemTypeByItemId = new Map((items ?? []).map((i) => [i.id as string, i.item_type as string]));

  const itemTypeIds = [...new Set([...itemTypeByItemId.values()])];
  const { data: checklists } = itemTypeIds.length
    ? await supabase.schema("hotel").from("procurement_quality_checklists").select("item_type_id,checklist_items").eq("tenant_id", tenantId).in("item_type_id", itemTypeIds)
    : { data: [] };
  const checklistByItemType = new Map(
    (checklists ?? []).map((c) => [c.item_type_id as string, (Array.isArray(c.checklist_items) ? (c.checklist_items as string[]) : [])]),
  );

  const result: Record<string, string[]> = {};
  for (const itemId of uniqueIds) {
    const itemType = itemTypeByItemId.get(itemId);
    result[itemId] = itemType ? checklistByItemType.get(itemType) ?? [] : [];
  }
  return result;
}
