import { createServerSupabaseClient } from "@/lib/supabase/server";
import { groupInputSchema, type CustomerGroup, type CustomerGroupInput } from "./customer-groups";

const db = () => createServerSupabaseClient().schema("store");

type GroupRow = { id: string; name: string; match: "all" | "any"; rules: unknown; created_at: string };

function toGroup(row: GroupRow): CustomerGroup | null {
  const parsed = groupInputSchema.safeParse({ name: row.name, match: row.match, rules: row.rules });
  return parsed.success ? { ...parsed.data, id: row.id, createdAt: row.created_at } : null;
}

/** The shop's saved groups, oldest first. Empty (not an error) until the table exists. */
export async function listCustomerGroups(tenantId: string): Promise<CustomerGroup[]> {
  const { data, error } = await db().from("customer_groups").select("id, name, match, rules, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: true });
  if (error) {
    if (error.code === "42P01" || error.code === "PGRST205") return [];
    throw new Error(error.message);
  }
  return ((data || []) as GroupRow[]).map(toGroup).filter((g): g is CustomerGroup => g !== null);
}

export async function createCustomerGroup(tenantId: string, userId: string | null, input: CustomerGroupInput) {
  const { data, error } = await db()
    .from("customer_groups")
    .insert({ tenant_id: tenantId, name: input.name, match: input.match, rules: input.rules, created_by: userId })
    .select("id, name, match, rules, created_at")
    .single();
  return { group: data ? toGroup(data as GroupRow) : null, error };
}

export async function updateCustomerGroup(tenantId: string, id: string, input: CustomerGroupInput) {
  const { data, error } = await db()
    .from("customer_groups")
    .update({ name: input.name, match: input.match, rules: input.rules, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("id, name, match, rules, created_at")
    .maybeSingle();
  return { group: data ? toGroup(data as GroupRow) : null, error };
}

export async function deleteCustomerGroup(tenantId: string, id: string) {
  const { data, error } = await db().from("customer_groups").delete().eq("tenant_id", tenantId).eq("id", id).select("name").maybeSingle();
  return { name: (data?.name as string | undefined) ?? null, error };
}
