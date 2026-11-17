import type { SupabaseClient } from "@supabase/supabase-js";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { readHotelMembership } from "@/lib/hms/membership-role";

/*
 * Who can take the keys on a shared screen. The terminal is signed in as one login; the people who may
 * switch to are that login's own department (a department head's terminal) or, for an owner or admin,
 * anyone in the hotel. A person can only be switched to once they have a PIN of their own.
 */

export const MAX_PIN_ATTEMPTS = 5;

export type SwitchablePerson = {
  userId: string;
  name: string;
  department: string;
  staffLevel: "hod" | "staff";
  hasPin: boolean;
  /** Locked after too many wrong PINs; their head of department clears it. */
  pinLocked: boolean;
};

export async function listSwitchablePeople(service: SupabaseClient, tenantId: string, sessionUserId: string): Promise<SwitchablePerson[]> {
  const session = await readHotelMembership(service, tenantId, sessionUserId);
  if (!session || session.status === "suspended") return [];
  const sessionIsAdmin = session.role === "owner" || session.role === "admin";

  const [logins, { data: pins }] = await Promise.all([
    getDepartmentLoginsForTenant(tenantId),
    service.schema("hotel").from("memberships").select("user_id, pin_hash, pin_locked_at").eq("tenant_id", tenantId),
  ]);
  const pinByUser = new Map((pins ?? []).map((p) => [p.user_id as string, p as { pin_hash: string | null; pin_locked_at: string | null }]));

  // The login the screen is signed in with can always take the keys back, even an owner (who has no department).
  const all = [...logins];
  if (!all.some((l) => l.userId === sessionUserId)) {
    const { data: u } = await service.auth.admin.getUserById(sessionUserId);
    const meta = (u?.user?.user_metadata ?? {}) as Record<string, unknown>;
    all.push({
      userId: sessionUserId,
      fullName: (typeof meta.full_name === "string" && meta.full_name.trim()) || u?.user?.email?.split("@")[0] || "Owner",
      departmentRole: session.departmentRole ?? (session.role === "owner" ? "Owner" : ""),
      staffLevel: session.staffLevel,
      email: u?.user?.email ?? "",
      status: "active",
      signInName: null,
      contactEmail: null,
      mustChangePassword: false,
      hrEmployeeId: null,
    });
  }

  return all
    .filter((l) => !l.mustChangePassword && (sessionIsAdmin || l.userId === sessionUserId || (session.departmentRole && l.departmentRole === session.departmentRole)))
    .map((l) => {
      const pin = pinByUser.get(l.userId);
      return {
        userId: l.userId,
        name: l.fullName,
        department: l.departmentRole,
        staffLevel: l.staffLevel,
        hasPin: Boolean(pin?.pin_hash),
        pinLocked: Boolean(pin?.pin_locked_at),
      };
    });
}
