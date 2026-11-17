import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { staffIdentifierFromEmail } from "@/lib/hms/staff-identity";

/**
 * Everyone who signs in to a department: its HOD and its staff. The list comes from hotel.memberships
 * (department, level and status live there); the login's own record supplies only the name and email.
 */
export type DepartmentLoginSummary = {
  departmentRole: string;
  /** The email the person signs in with, or "" for a staff login that uses a username. */
  email: string;
  fullName: string;
  userId: string;
  staffLevel: "hod" | "staff";
  status: "active" | "suspended";
  /** What a staff login types to sign in (username@hotel); null for a login that uses a real email. */
  signInName: string | null;
  contactEmail: string | null;
  mustChangePassword: boolean;
  /** The HR record this person is, once linked. */
  hrEmployeeId: string | null;
};

type Row = {
  hr_employee_id?: string | null;
  user_id: string;
  department_role: string | null;
  staff_level?: string | null;
  status?: string | null;
  username?: string | null;
  contact_email?: string | null;
  must_change_password?: boolean | null;
};

async function readMemberships(tenantId: string): Promise<Row[]> {
  const service = createServerSupabaseClient();
  const base = () => service.schema("hotel").from("memberships");
  const full = await base()
    .select("user_id, department_role, staff_level, status, username, contact_email, must_change_password, hr_employee_id")
    .eq("tenant_id", tenantId)
    .in("role", ["admin", "staff"])
    .order("created_at", { ascending: true });
  if (!full.error) return (full.data ?? []) as Row[];
  // Before the staff-logins migration: department only, every login a HOD.
  const legacy = await base().select("user_id, department_role").eq("tenant_id", tenantId).in("role", ["admin", "staff"]);
  return (legacy.data ?? []) as Row[];
}

async function loadDepartmentLoginsForTenant(tenantId: string, includeSuspended: boolean): Promise<DepartmentLoginSummary[]> {
  const service = createServerSupabaseClient();
  const rows = await readMemberships(tenantId);
  if (!rows.length) return [];

  const logins = await Promise.all(
    rows.map(async (row) => {
      const { data, error } = await service.auth.admin.getUserById(row.user_id);
      if (error || !data.user) return null;

      const meta = data.user.user_metadata ?? {};
      // The membership's department; an old login that has none yet still shows under its metadata one.
      const metaDept = typeof meta.department_role === "string" ? meta.department_role : "";
      const departmentRole = row.department_role?.trim() || (row.staff_level === "staff" ? "" : metaDept.trim());
      if (!departmentRole) return null;

      const status = row.status === "suspended" ? "suspended" : "active";
      if (status === "suspended" && !includeSuspended) return null;

      const fullName = typeof meta.full_name === "string" && meta.full_name.trim() ? meta.full_name.trim() : departmentRole;
      const internal = staffIdentifierFromEmail(data.user.email);
      return {
        departmentRole,
        email: internal ? "" : (data.user.email ?? ""),
        fullName,
        userId: data.user.id,
        staffLevel: row.staff_level === "staff" ? "staff" : "hod",
        status,
        signInName: internal,
        contactEmail: row.contact_email ?? null,
        mustChangePassword: row.must_change_password === true,
        hrEmployeeId: row.hr_employee_id ?? null,
      } satisfies DepartmentLoginSummary;
    }),
  );

  return logins.filter((login): login is DepartmentLoginSummary => Boolean(login));
}

/** Active logins (HODs and staff). Pass `includeSuspended` for the screens that manage the team. */
export async function getDepartmentLoginsForTenant(
  tenantId: string,
  options: { includeSuspended?: boolean } = {},
): Promise<DepartmentLoginSummary[]> {
  return loadDepartmentLoginsForTenant(tenantId, options.includeSuspended === true);
}

export async function getDepartmentLoginsBySlug(
  slug: string,
  options: { includeSuspended?: boolean } = {},
): Promise<DepartmentLoginSummary[]> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return [];
  return getDepartmentLoginsForTenant(tenant.id, options);
}

/** Departments that already have a HOD login. */
export async function getDepartmentLoginRolesForTenant(tenantId: string): Promise<string[]> {
  const logins = await loadDepartmentLoginsForTenant(tenantId, true);
  return [...new Set(logins.filter((login) => login.staffLevel === "hod").map((login) => login.departmentRole))];
}

export async function getDepartmentLoginRolesBySlug(slug: string): Promise<string[]> {
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return [];

  return getDepartmentLoginRolesForTenant(tenant.id);
}
