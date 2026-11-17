import { getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { effectiveDepartmentRole, readHotelMembership } from "@/lib/hms/membership-role";
import { getDepartmentScopeDefinition, hasFullHotelAccess, type HmsSectionKey } from "@/lib/hms/department-access";
import { resolveEffectiveUser } from "@/lib/hms/active-person";
import { actorDisplayName, attributedService, type Actor } from "@/lib/hms/attribution";
import { verifyPersonalApproval } from "@/lib/hms/approvals";
import { canDoWithoutApproval, HOD_ACTION_LABELS, type HodAction } from "@/lib/hms/capabilities";

export async function requireHotelApiMember(slug: string) {
  const user = await getSessionUser();
  if (!user) return { error: "Unauthorized" as const, status: 401 as const };

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return { error: "Tenant not found." as const, status: 404 as const };

  const service = createServerSupabaseClient();

  // On a shared screen the person whose PIN is active is the one acting; a locked screen does nothing.
  const effective = await resolveEffectiveUser(tenant.id, user.id);
  if (effective.locked) {
    return { error: "This screen is locked. Enter your PIN to carry on." as const, status: 423 as const };
  }
  const membership = await readHotelMembership(service, tenant.id, effective.userId);

  if (!membership) return { error: "Forbidden" as const, status: 403 as const };

  // The login the screen was signed in with must itself still be in good standing.
  if (effective.switched) {
    const sessionMembership = await readHotelMembership(service, tenant.id, user.id);
    if (!sessionMembership || sessionMembership.status === "suspended") {
      return { error: "This login is suspended. Ask your manager." as const, status: 403 as const };
    }
  }

  // A suspended login is signed out and shut out of every route at once.
  if (membership.status === "suspended") {
    return { error: "This login is suspended. Ask your manager." as const, status: 403 as const };
  }
  // A new login can do nothing until it has replaced its temporary password.
  if (membership.mustChangePassword) {
    return { error: "Change your temporary password first." as const, status: 403 as const };
  }

  // The department role at this hotel: the membership's (metadata only for an old HOD login that has none).
  // The acting person: the signed-in login, or whoever switched in by PIN (then nothing of the login's own metadata applies).
  const acting: typeof user = effective.switched
    ? { id: effective.userId, email: undefined, user_metadata: effective.name ? { full_name: effective.name } : {}, app_metadata: {} }
    : user;
  const departmentRole = effectiveDepartmentRole(membership, acting.user_metadata);

  // Who is acting. Everything the routes write through `service` is stamped with this person, taken
  // from the session here on the server and never from the request.
  const actor: Actor = {
    userId: acting.id,
    name: actorDisplayName(acting, membership.username),
    department: departmentRole,
    staffLevel: membership.staffLevel,
    role: membership.role,
  };
  const attributed = await attributedService(service, tenant.id, actor);

  return {
    user: acting,
    tenant,
    service: attributed,
    role: membership.role as string,
    departmentRole,
    staffLevel: membership.staffLevel,
    actor,
  };
}

/**
 * A member who may do `action` (a void, refund, rate change...) without a HOD: owners, admins and HODs,
 * and staff only when the hotel hasn't made that action HOD-only for their department. Staff get a 403
 * that says a HOD has to do it, unless `approvalPin` is a HOD's own PIN (then it goes ahead and the log names the approver).
 * Pass `sections` to also require the section, as requireHotelApiSection does.
 */
export async function requireHotelApiCapability(slug: string, action: HodAction, sections?: HmsSectionKey[], approvalPin?: string) {
  const auth = sections ? await requireHotelApiSection(slug, sections) : await requireHotelApiMember(slug);
  if ("error" in auth) return auth;
  const allowed = await canDoWithoutApproval(auth.service, {
    tenantId: auth.tenant.id,
    membershipRole: auth.role,
    staffLevel: auth.staffLevel,
    departmentRole: auth.departmentRole,
    action,
  });
  if (!allowed) {
    // Not blocked for good: a head of department keys in their own PIN to approve it on the spot.
    if (approvalPin?.trim() && (await verifyPersonalApproval(auth.service, auth.tenant.id, approvalPin))) return auth;
    return {
      error: `${HOD_ACTION_LABELS[action].label} need your head of department. Ask them to do it or approve it with their PIN.` as const,
      status: 403 as const,
      requiresManagerApproval: true as const,
    };
  }
  return auth;
}

/** Who may use guest bills (folios), check-out and deposits: the front desk, reservations and Accounts. */
export const FOLIO_SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations", "accounts"];

/**
 * A hotel member whose role reaches one of these sections, the same rule the screens use:
 * owners and full-access admins reach everything; department staff only their department's
 * sections. Without this, anyone in the hotel could call a route a screen hides from them.
 */
export async function requireHotelApiSection(slug: string, sections: HmsSectionKey[] = FOLIO_SECTIONS) {
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return auth;
  if (hasFullHotelAccess(auth.role, auth.departmentRole)) return auth;
  const allowed = getDepartmentScopeDefinition(auth.departmentRole)?.allowedSections ?? [];
  if (!sections.some((s) => allowed.includes(s))) {
    return { error: "Your role can't use guest bills. Ask a manager if you need to." as const, status: 403 as const };
  }
  return auth;
}
