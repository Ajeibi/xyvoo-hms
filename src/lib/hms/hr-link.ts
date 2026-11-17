import type { SupabaseClient } from "@supabase/supabase-js";

/*
 * A login and an HR record are the same person. The link lives on both sides: hr_employees.user_id
 * (what HR already had) and memberships.hr_employee_id (the login side). Every change goes through
 * here so the two never disagree. One login per HR record, and one HR record per login, inside a hotel.
 */

export type LinkResult = { ok: true } | { ok: false; error: string };

/** Links a login to an HR record (or removes the link with `employeeId = null`), on both sides. */
export async function linkLoginToEmployee(service: SupabaseClient, tenantId: string, userId: string, employeeId: string | null): Promise<LinkResult> {
  const db = service.schema("hotel");

  const { data: member } = await db.from("memberships").select("user_id").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
  if (!member) return { ok: false, error: "That login isn't part of this hotel." };

  if (employeeId) {
    const { data: employee } = await db.from("hr_employees").select("id,user_id").eq("tenant_id", tenantId).eq("id", employeeId).maybeSingle();
    if (!employee) return { ok: false, error: "That HR record wasn't found." };
    if (employee.user_id && employee.user_id !== userId) return { ok: false, error: "That HR record already has a different login." };
  }

  // Drop whatever either side pointed at before, so nothing is left dangling.
  await db.from("hr_employees").update({ user_id: null }).eq("tenant_id", tenantId).eq("user_id", userId);
  if (employeeId) await db.from("memberships").update({ hr_employee_id: null }).eq("tenant_id", tenantId).eq("hr_employee_id", employeeId);
  await db.from("memberships").update({ hr_employee_id: null }).eq("tenant_id", tenantId).eq("user_id", userId);

  if (!employeeId) return { ok: true };

  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    db.from("hr_employees").update({ user_id: userId }).eq("tenant_id", tenantId).eq("id", employeeId),
    db.from("memberships").update({ hr_employee_id: employeeId }).eq("tenant_id", tenantId).eq("user_id", userId),
  ]);
  if (e1 || e2) return { ok: false, error: (e1 ?? e2)?.message || "Could not link." };
  return { ok: true };
}

/** HR changed an employee's login: mirror it onto the memberships. Never throws; HR's own save already worked. */
export async function mirrorEmployeeLogin(service: SupabaseClient, tenantId: string, employeeId: string, userId: string | null) {
  try {
    const db = service.schema("hotel");
    // Whoever pointed at this record before no longer does.
    await db.from("memberships").update({ hr_employee_id: null }).eq("tenant_id", tenantId).eq("hr_employee_id", employeeId);
    if (!userId) return;
    await db.from("memberships").update({ hr_employee_id: null }).eq("tenant_id", tenantId).eq("user_id", userId);
    await db.from("memberships").update({ hr_employee_id: employeeId }).eq("tenant_id", tenantId).eq("user_id", userId);
  } catch (e) {
    console.warn("[hr-link] mirror failed", e);
  }
}

export type LinkableEmployee = { id: string; name: string; jobTitle: string | null; department: string | null };

/** Active HR records with no login yet, optionally for one department, for the "link to HR" pickers. */
export async function listLinkableEmployees(service: SupabaseClient, tenantId: string, department?: string | null): Promise<LinkableEmployee[]> {
  try {
    let query = service
      .schema("hotel")
      .from("hr_employees")
      .select("id,first_name,last_name,job_title,department")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .is("user_id", null)
      .order("first_name")
      .limit(500);
    if (department) query = query.eq("department", department);
    const { data } = await query;
    return (data ?? []).map((e) => ({
      id: e.id as string,
      name: `${e.first_name} ${e.last_name}`.trim(),
      jobTitle: (e.job_title as string | null) ?? null,
      department: (e.department as string | null) ?? null,
    }));
  } catch {
    return [];
  }
}
