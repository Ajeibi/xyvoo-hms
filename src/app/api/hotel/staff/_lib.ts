import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { CREATABLE_DEPARTMENT_ROLES } from "@/lib/hms/role-sections";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const DepartmentRoleSchema = z.enum(CREATABLE_DEPARTMENT_ROLES as [string, ...string[]]);

export type StaffManager = {
  userId: string;
  tenantId: string;
  service: SupabaseClient;
  tenant: { id: string; subdomain: string | null; name: string | null };
  /** owner/admin may manage anyone; a HOD only the staff of their own department. */
  isAdmin: boolean;
  departmentRole: string | null;
};

/**
 * Who may manage logins: owners and admins for everyone, and a HOD for the staff of their own department.
 * A suspended login, or one that still has a temporary password, is turned away by requireHotelApiMember.
 */
export async function requireStaffManager(slug: string): Promise<StaffManager | { error: string; status: number }> {
  const auth = await requireHotelApiMember(slug);
  const failure = auth as { error?: string; status?: number };
  if (failure.error) return { error: failure.error, status: failure.status ?? 403 };
  const ok = auth as Extract<typeof auth, { user: unknown }>;
  const isAdmin = isAdminLikeRole(ok.role);
  const isHod = ok.role === "staff" && ok.staffLevel === "hod" && Boolean(ok.departmentRole);
  if (!isAdmin && !isHod) {
    return { error: "Only an owner, an admin or the head of the department can manage logins.", status: 403 };
  }
  const manager: StaffManager = {
    userId: ok.user.id,
    tenantId: ok.tenant.id,
    service: ok.service,
    tenant: ok.tenant as unknown as StaffManager["tenant"],
    isAdmin,
    departmentRole: ok.departmentRole,
  };
  return manager;
}

export type StaffTarget = {
  userId: string;
  role: string;
  departmentRole: string | null;
  staffLevel: "hod" | "staff";
  status: "active" | "suspended";
};

export async function readStaffTarget(tenantId: string, userId: string): Promise<StaffTarget | null> {
  const service = createServerSupabaseClient();
  const { data } = await service
    .schema("hotel")
    .from("memberships")
    .select("user_id, role, department_role, staff_level, status")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return {
    userId: String(row.user_id),
    role: String(row.role),
    departmentRole: typeof row.department_role === "string" ? row.department_role : null,
    staffLevel: row.staff_level === "staff" ? "staff" : "hod",
    status: row.status === "suspended" ? "suspended" : "active",
  };
}

/** Whether the manager may act on this person: never an owner or themselves; a HOD only on their own department's staff. */
export function canManageTarget(manager: StaffManager, target: StaffTarget): string | null {
  if (target.role === "owner") return "The owner's login can't be managed here.";
  if (target.userId === manager.userId) return "You can't change your own login here.";
  if (manager.isAdmin) return null;
  if (target.staffLevel !== "staff" || !manager.departmentRole || target.departmentRole !== manager.departmentRole) {
    return "A head of department can only manage staff in their own department.";
  }
  return null;
}
