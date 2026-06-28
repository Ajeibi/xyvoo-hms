import type { SupabaseClient } from "@supabase/supabase-js";

export type CheckInStaffOption = {
  userId: string;
  displayName: string;
  role: string;
};

function roleLabel(role: string): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Staff";
}

function formatStaffDisplayName(
  contactName: string | null | undefined,
  role: string,
  userId: string,
): string {
  const name = contactName?.trim();
  if (name) return `${name} (${roleLabel(role)})`;
  return `Account ${userId.slice(0, 8)}… (${roleLabel(role)})`;
}

/**
 * Users who can be attributed as having performed a check-in for this tenant
 * (hotel memberships + profile contact name when available).
 */
export async function fetchCheckInStaffOptions(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<CheckInStaffOption[]> {
  const { data: members, error: memErr } = await supabase
    .schema("hotel")
    .from("memberships")
    .select("user_id, role")
    .eq("tenant_id", tenantId);

  if (memErr || !members?.length) return [];

  const userIds = [...new Set(members.map((m) => m.user_id as string))];

  const { data: profiles } = await supabase
    .schema("hotel")
    .from("profiles")
    .select("user_id, contact_name")
    .in("user_id", userIds);

  const nameByUser = new Map((profiles ?? []).map((p) => [p.user_id as string, p.contact_name as string | null]));

  return members
    .map((m) => {
      const userId = m.user_id as string;
      const role = String(m.role ?? "staff");
      return {
        userId,
        role,
        displayName: formatStaffDisplayName(nameByUser.get(userId), role, userId),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }));
}

/** Only the signed-in user may be attributed at check-in (not a full staff picker). */
export function checkInStaffOptionsForSessionUser(
  options: CheckInStaffOption[],
  sessionUserId: string | null | undefined,
): CheckInStaffOption[] {
  if (!sessionUserId) return [];
  const match = options.find((o) => o.userId === sessionUserId);
  return match ? [match] : [];
}
