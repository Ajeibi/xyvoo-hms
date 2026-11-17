import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * A login's standing at one hotel. Everything that decides what a person may do (their system role,
 * department, HOD/staff level and whether they are suspended) lives on hotel.memberships. The login's
 * own metadata is editable by the user, so it is never trusted for level or status, and it is read for the
 * department only as a last resort for an old head-of-department login whose membership has none.
 *
 * Until migration 20261215100000 has run, the new columns don't exist; the reads below then fall back
 * to the older column sets so nothing breaks in between (every existing login is a HOD and active).
 */

export type StaffLevel = "hod" | "staff";
export type MembershipStatus = "active" | "suspended";

export type HotelMembership = {
  role: string;
  departmentRole: string | null;
  staffLevel: StaffLevel;
  status: MembershipStatus;
  username: string | null;
  mustChangePassword: boolean;
  /** Whether this person has set a PIN (the PIN itself is never passed around), and whether it is locked out. */
  hasPin: boolean;
  pinLocked: boolean;
};

const NEW_COLUMNS = "staff_level, status, username, must_change_password, pin_hash, pin_locked_at";

function isMissingColumn(message: string | undefined) {
  return Boolean(
    message && /(department_role|staff_level|must_change_password|username|status|pin_hash|pin_locked_at)/i.test(message) && /(column|schema cache)/i.test(message),
  );
}

function toMembership(row: Record<string, unknown>): HotelMembership {
  const dept = row.department_role;
  return {
    role: String(row.role),
    departmentRole: typeof dept === "string" && dept.trim() ? dept : null,
    staffLevel: row.staff_level === "staff" ? "staff" : "hod",
    status: row.status === "suspended" ? "suspended" : "active",
    username: typeof row.username === "string" && row.username ? row.username : null,
    mustChangePassword: row.must_change_password === true,
    hasPin: typeof row.pin_hash === "string" && row.pin_hash.length > 0,
    pinLocked: Boolean(row.pin_locked_at),
  };
}

/** The caller's membership at a hotel, or null when they aren't a member. */
export async function readHotelMembership(
  service: SupabaseClient,
  tenantId: string,
  userId: string,
): Promise<HotelMembership | null> {
  const base = () => service.schema("hotel").from("memberships");
  const first = await base()
    .select(`role, department_role, ${NEW_COLUMNS}`)
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!first.error) return first.data ? toMembership(first.data as unknown as Record<string, unknown>) : null;
  if (!isMissingColumn(first.error.message)) return null;

  const second = await base().select("role, department_role").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  if (!second.error) return second.data ? toMembership(second.data as unknown as Record<string, unknown>) : null;
  if (!isMissingColumn(second.error.message)) return null;

  const third = await base().select("role").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  return third.data ? toMembership(third.data as unknown as Record<string, unknown>) : null;
}

/**
 * The department that applies at this hotel: the membership's. A head-of-department login whose membership
 * has none yet still uses its metadata (and that is logged so it can be fixed); a staff-level login never does.
 */
export function effectiveDepartmentRole(
  membership: Pick<HotelMembership, "departmentRole" | "staffLevel"> | null | undefined,
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (membership?.departmentRole?.trim()) return membership.departmentRole;
  if (membership?.staffLevel === "staff") return null;
  const fromMetadata = metadata?.department_role;
  if (typeof fromMetadata === "string" && fromMetadata.trim()) {
    console.warn("[hms] department read from login metadata because the membership has none");
    return fromMetadata;
  }
  return null;
}

export type NewMembership = {
  tenant_id: string;
  user_id: string;
  role: string;
  department_role?: string | null;
  staff_level?: StaffLevel;
  username?: string | null;
  contact_email?: string | null;
  created_by?: string | null;
  must_change_password?: boolean;
};

/** Adds a membership. Errors if the database hasn't had the staff-logins migration yet and a new field is needed. */
export async function insertHotelMembership(
  service: SupabaseClient,
  row: NewMembership,
): Promise<{ error: { message: string } | null }> {
  const { error } = await service.schema("hotel").from("memberships").insert(row);
  return { error };
}

/** An owner or admin of the hotel whose login is active: the check behind the hotel setup routes. */
export async function isActiveHotelAdmin(service: SupabaseClient, tenantId: string, userId: string): Promise<boolean> {
  const membership = await readHotelMembership(service, tenantId, userId);
  return Boolean(
    membership &&
      (membership.role === "owner" || membership.role === "admin") &&
      membership.status === "active" &&
      !membership.mustChangePassword,
  );
}
