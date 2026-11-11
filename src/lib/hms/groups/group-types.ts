/*
 * Hotel groups: shapes and wording shared by the server and the browser. No server imports here.
 *
 * A hotel group sits above hotels. Every hotel is in exactly one group (a hotel on its own is a
 * group of one). Group roles see every hotel in the group for the dashboard, reports and accounts;
 * hotel staff see another hotel only in areas the group owner shares (guests, loyalty, rates), and
 * only to read. The database enforces it (hotel.group_can_read); see docs/HMS_GROUPS_DESIGN.md.
 */

export const GROUP_ROLES = ["group_owner", "group_admin", "group_viewer"] as const;
export type GroupRole = (typeof GROUP_ROLES)[number];

export const GROUP_ROLE_LABELS: Record<GroupRole, string> = {
  group_owner: "Group owner",
  group_admin: "Group admin",
  group_viewer: "Group viewer",
};

export const GROUP_ROLE_HELP: Record<GroupRole, string> = {
  group_owner: "Everything: hotels, invitations, people, what hotels share, rates and reports.",
  group_admin: "Reports, accounts, guest links and group rates. Can't change hotels, sharing or people.",
  group_viewer: "Read-only group dashboard, reports and accounts.",
};

export function isGroupRole(value: unknown): value is GroupRole {
  return typeof value === "string" && (GROUP_ROLES as readonly string[]).includes(value);
}

export function canEditGroup(role: GroupRole | null | undefined): boolean {
  return role === "group_owner" || role === "group_admin";
}

export type GroupSummary = { id: string; name: string; slug: string; baseCurrency: string };

export type GroupHotel = {
  tenantId: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  currency: string;
  joinedAt: string;
};

export type GroupSharing = {
  shareGuests: boolean;
  shareLoyalty: boolean;
  shareRates: boolean;
  matchByPhone: boolean;
  updatedAt: string | null;
};

export const NO_SHARING: GroupSharing = { shareGuests: false, shareLoyalty: false, shareRates: false, matchByPhone: false, updatedAt: null };

/** A place a login can go: one of its hotels, or a group it has a role in. */
export type UserPlace =
  | { kind: "hotel"; tenantId: string; slug: string; name: string; groupId: string | null }
  | { kind: "group"; groupId: string; slug: string; name: string; role: GroupRole; hotelCount: number };

export const GROUP_AUDIT_LABELS: Record<string, string> = {
  group_created: "Group created",
  group_renamed: "Group renamed",
  hotel_joined: "Hotel joined",
  hotel_left: "Hotel left the group",
  invite_created: "Hotel invited",
  invite_cancelled: "Invitation cancelled",
  member_added: "Person added",
  member_role_changed: "Role changed",
  member_removed: "Person removed",
  sharing_changed: "Sharing changed",
  guest_linked: "Guest linked",
  guest_unlinked: "Guest unlinked",
  guest_matching_run: "Guest matching run",
  ic_account_added: "Inter-company account marked",
  ic_account_removed: "Inter-company account unmarked",
  rate_template_saved: "Group rate saved",
  rate_template_pushed: "Group rate sent to hotel",
  rate_template_withdrawn: "Group rate taken off hotel",
  report_settings_changed: "Report email changed",
};
