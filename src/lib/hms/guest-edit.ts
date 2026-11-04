import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { guestRowFromFields, type GuestFieldsInput } from "@/lib/hms/guest-fields";

/**
 * Adding and changing a guest by hand. This is the profile's own editor: the front desk's
 * check-in still creates its own guest records, and a merge (guest-merge.ts) joins any duplicates.
 */

async function companyExists(service: SupabaseClient, tenantId: string, companyId: string) {
  const { data } = await service.schema("hotel").from("ar_customers").select("id").eq("tenant_id", tenantId).eq("id", companyId).maybeSingle();
  return Boolean(data);
}

export async function createGuest(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; fields: GuestFieldsInput },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (params.fields.companyId && !(await companyExists(service, params.tenantId, params.fields.companyId))) {
    return { ok: false, error: "That company wasn't found." };
  }
  const { data, error } = await service
    .schema("hotel")
    .from("guests")
    .insert({ tenant_id: params.tenantId, ...guestRowFromFields(params.fields) })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not add the guest." };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "guest_created",
    entityType: "guest",
    entityId: data.id as string,
    after: { name: `${params.fields.firstName} ${params.fields.lastName}` },
  });
  return { ok: true, id: data.id as string };
}

export async function updateGuest(
  service: SupabaseClient,
  params: { tenantId: string; guestId: string; actorUserId: string; fields: GuestFieldsInput },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: before } = await service
    .schema("hotel")
    .from("guests")
    .select("*")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.guestId)
    .maybeSingle();
  if (!before) return { ok: false, error: "Guest not found." };
  if (before.anonymised_at) return { ok: false, error: "This guest's details were erased, so they can't be changed." };
  if (params.fields.companyId && !(await companyExists(service, params.tenantId, params.fields.companyId))) {
    return { ok: false, error: "That company wasn't found." };
  }

  const row = { ...guestRowFromFields(params.fields), updated_at: new Date().toISOString() };
  const { error } = await service.schema("hotel").from("guests").update(row).eq("tenant_id", params.tenantId).eq("id", params.guestId);
  if (error) return { ok: false, error: error.message };

  // Record only what changed.
  const changed: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key === "updated_at") continue;
    const old = (before as Record<string, unknown>)[key] ?? null;
    if (old !== value) changed[key] = { from: old, to: value };
  }
  if (Object.keys(changed).length > 0) {
    await writeAuditLog({
      tenantId: params.tenantId,
      actorUserId: params.actorUserId,
      action: "guest_updated",
      entityType: "guest",
      entityId: params.guestId,
      after: { changed },
    });
  }
  return { ok: true };
}
