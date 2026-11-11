import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * A login's role at one hotel. The department role (Front desk, F&B, HR...) now lives on the hotel
 * membership (hotel.memberships.department_role), so one login can hold a different department at
 * each hotel in a group. Until it is filled in, and on a database where the column doesn't exist
 * yet, the login's metadata is used as before, so nothing changes for anyone in one hotel.
 */

export type HotelMembershipRole = { role: string; departmentRole: string | null };

function isMissingColumn(message: string | undefined) {
  return Boolean(message && /department_role/i.test(message) && /(column|schema cache)/i.test(message));
}

/** The caller's membership at a hotel, or null when they aren't a member. */
export async function readHotelMembership(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<{ role: string; departmentRole: string | null } | null> {
  const first = await service
    .schema("hotel")
    .from("memberships")
    .select("role, department_role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!first.error) {
    if (!first.data) return null;
    const dept = (first.data as { department_role?: unknown }).department_role;
    return { role: String(first.data.role), departmentRole: typeof dept === "string" && dept.trim() ? dept : null };
  }
  if (!isMissingColumn(first.error.message)) return null;
  const fallback = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return fallback.data ? { role: String(fallback.data.role), departmentRole: null } : null;
}

/** The department role that applies at this hotel: the membership's, else the login's metadata. */
export function effectiveDepartmentRole(membershipRole: string | null | undefined, metadata: Record<string, unknown> | null | undefined): string | null {
  if (typeof membershipRole === "string" && membershipRole.trim()) return membershipRole;
  const fromMetadata = metadata?.department_role;
  return typeof fromMetadata === "string" && fromMetadata.trim() ? fromMetadata : null;
}

/** Adds a membership, writing the department role too when the database has the column. */
export async function insertHotelMembership(
  service: SupabaseClient,
  row: { tenant_id: string; user_id: string; role: string; department_role?: string | null },
): Promise<{ error: { message: string } | null }> {
  const { error } = await service.schema("hotel").from("memberships").insert(row);
  if (!error || !isMissingColumn(error.message) || row.department_role === undefined) return { error };
  const { department_role: _skip, ...rest } = row;
  void _skip;
  const retry = await service.schema("hotel").from("memberships").insert(rest);
  return { error: retry.error };
}
