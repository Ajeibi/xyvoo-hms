import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAuthServerClient, getSessionUser } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  canEditGroup,
  isGroupRole,
  NO_SHARING,
  type GroupHotel,
  type GroupRole,
  type GroupSharing,
  type GroupSummary,
  type UserPlace,
} from "./group-types";

/*
 * Who may use a group's screens, and the places (hotels and groups) a login can reach.
 *
 * Rule for every group feature: data from another hotel is read with the signed-in user's own token
 * (userDb below), so the database's row-level security decides. The service key is only used for the
 * group's own tables (after the role check here) and for system jobs.
 */

function isMissingRelation(message: string | undefined) {
  return Boolean(message && /(does not exist|schema cache|Could not find)/i.test(message));
}

/** Where a login that runs a group of several hotels should start, or null. */
export async function getUserGroupHomePath(userId: string): Promise<string | null> {
  const service = createServerSupabaseClient();
  const { data: roles, error } = await service
    .schema("hotel")
    .from("hotel_group_members")
    .select("group_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !roles?.length) return null;
  const groupIds = roles.map((r) => r.group_id as string);
  const { data: hotels } = await service.schema("hotel").from("hotel_group_hotels").select("group_id").in("group_id", groupIds);
  const counts = new Map<string, number>();
  for (const h of hotels ?? []) counts.set(h.group_id as string, (counts.get(h.group_id as string) ?? 0) + 1);
  const multi = groupIds.find((g) => (counts.get(g) ?? 0) > 1);
  if (!multi) return null;
  const { data: group } = await service.schema("hotel").from("hotel_groups").select("slug").eq("id", multi).maybeSingle();
  return group?.slug ? `/hms-group/${group.slug}/dashboard` : null;
}

/** Every hotel the login works at and every group it has a role in. */
export const listUserPlaces = cache(async (userId: string): Promise<UserPlace[]> => {
  const service = createServerSupabaseClient();
  const { data: memberships } = await service.schema("hotel").from("memberships").select("tenant_id, created_at").eq("user_id", userId).order("created_at", { ascending: true });
  const tenantIds = (memberships ?? []).map((m) => m.tenant_id as string);
  const places: UserPlace[] = [];

  const [{ data: tenants }, groupLinks, groupRoles] = await Promise.all([
    tenantIds.length
      ? service.from("tenants").select("id, subdomain, name, display_name").eq("product", "hotel").in("id", tenantIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    tenantIds.length
      ? service.schema("hotel").from("hotel_group_hotels").select("tenant_id, group_id").in("tenant_id", tenantIds)
      : Promise.resolve({ data: [] as Array<Record<string, unknown>>, error: null }),
    service.schema("hotel").from("hotel_group_members").select("group_id, role").eq("user_id", userId),
  ]);
  const groupOf = new Map<string, string>();
  if (!groupLinks.error) for (const l of groupLinks.data ?? []) groupOf.set(l.tenant_id as string, l.group_id as string);

  const byId = new Map((tenants ?? []).map((t) => [t.id as string, t]));
  for (const id of tenantIds) {
    const t = byId.get(id);
    if (!t) continue;
    const slug = (t.subdomain as string) || (t.name as string) || id;
    places.push({ kind: "hotel", tenantId: id, slug, name: ((t.display_name as string) || (t.name as string) || slug).trim(), groupId: groupOf.get(id) ?? null });
  }

  if (!groupRoles.error && groupRoles.data?.length) {
    const ids = groupRoles.data.map((r) => r.group_id as string);
    const [{ data: groups }, { data: hotelRows }] = await Promise.all([
      service.schema("hotel").from("hotel_groups").select("id, slug, name").in("id", ids),
      service.schema("hotel").from("hotel_group_hotels").select("group_id").in("group_id", ids),
    ]);
    const counts = new Map<string, number>();
    for (const h of hotelRows ?? []) counts.set(h.group_id as string, (counts.get(h.group_id as string) ?? 0) + 1);
    for (const r of groupRoles.data) {
      const g = (groups ?? []).find((x) => x.id === r.group_id);
      if (!g || !isGroupRole(r.role)) continue;
      places.push({ kind: "group", groupId: g.id as string, slug: g.slug as string, name: g.name as string, role: r.role, hotelCount: counts.get(g.id as string) ?? 0 });
    }
  }
  return places;
});

export type GroupAccessContext = {
  userId: string;
  userEmail: string | null;
  group: GroupSummary;
  role: GroupRole;
  canEdit: boolean;
  isOwner: boolean;
  hotels: GroupHotel[];
  sharing: GroupSharing;
  /** The signed-in user's own database client: row-level security applies to everything read with it. */
  userDb: SupabaseClient;
  /** Service client for the group's own tables. Never use it to read another hotel's data. */
  service: SupabaseClient;
};

export type GroupAccessResult = { ok: true; ctx: GroupAccessContext } | { ok: false; reason: "signed_out" | "not_found" | "forbidden" };

async function loadGroupBySlug(service: SupabaseClient, slug: string) {
  const { data, error } = await service.schema("hotel").from("hotel_groups").select("id, name, slug, base_currency").eq("slug", slug).maybeSingle();
  if (error && !isMissingRelation(error.message)) throw new Error(error.message);
  return data ?? null;
}

export async function loadGroupHotels(userDb: SupabaseClient, groupId: string): Promise<GroupHotel[]> {
  const { data, error } = await userDb.schema("hotel").rpc("group_hotel_list", { p_group: groupId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    tenantId: r.tenant_id as string,
    slug: r.slug as string,
    name: (r.name as string) || (r.slug as string),
    logoUrl: (r.logo_url as string) || null,
    currency: (r.currency as string) || "NGN",
    joinedAt: r.joined_at as string,
  }));
}

export async function loadGroupSharing(service: SupabaseClient, groupId: string): Promise<GroupSharing> {
  const { data } = await service.schema("hotel").from("hotel_group_sharing").select("share_guests, share_loyalty, share_rates, match_by_phone, updated_at").eq("group_id", groupId).maybeSingle();
  if (!data) return NO_SHARING;
  return {
    shareGuests: Boolean(data.share_guests),
    shareLoyalty: Boolean(data.share_loyalty),
    shareRates: Boolean(data.share_rates),
    matchByPhone: Boolean(data.match_by_phone),
    updatedAt: (data.updated_at as string) ?? null,
  };
}

/** Cached per render: the layout and the page both ask. */
export const getGroupAccess = cache(async (groupSlug: string): Promise<GroupAccessResult> => {
  const user = await getSessionUser();
  if (!user) return { ok: false, reason: "signed_out" };
  const service = createServerSupabaseClient();
  const group = await loadGroupBySlug(service, groupSlug);
  if (!group) return { ok: false, reason: "not_found" };
  const { data: member } = await service.schema("hotel").from("hotel_group_members").select("role").eq("group_id", group.id).eq("user_id", user.id).maybeSingle();
  if (!member || !isGroupRole(member.role)) return { ok: false, reason: "forbidden" };
  const userDb = await createSupabaseAuthServerClient();
  const [hotels, sharing] = await Promise.all([loadGroupHotels(userDb, group.id as string), loadGroupSharing(service, group.id as string)]);
  const role = member.role;
  return {
    ok: true,
    ctx: {
      userId: user.id,
      userEmail: user.email ?? null,
      group: { id: group.id as string, name: group.name as string, slug: group.slug as string, baseCurrency: (group.base_currency as string) || "NGN" },
      role,
      canEdit: canEditGroup(role),
      isOwner: role === "group_owner",
      hotels,
      sharing,
      userDb,
      service,
    },
  };
});

/** For API routes: the group context when the caller holds one of the roles, else an error to return. */
export async function requireGroupApi(groupSlug: string, roles: GroupRole[] = ["group_owner", "group_admin", "group_viewer"]) {
  const access = await getGroupAccess(groupSlug);
  if (!access.ok) {
    const status = access.reason === "signed_out" ? 401 : access.reason === "not_found" ? 404 : 403;
    return { error: access.reason === "signed_out" ? "Sign in first." : access.reason === "not_found" ? "Group not found." : "You don't have a role in this group.", status } as const;
  }
  if (!roles.includes(access.ctx.role)) {
    return { error: "Your group role can't do this. Ask the group owner.", status: 403 } as const;
  }
  return { ctx: access.ctx } as const;
}

/** Writes one line to the group's activity log. Never throws. */
export async function logGroupAction(
  service: SupabaseClient,
  entry: { groupId: string; actorUserId: string | null; action: string; tenantId?: string | null; detail?: Record<string, unknown> },
) {
  try {
    await service.schema("hotel").from("hotel_group_audit").insert({
      group_id: entry.groupId,
      actor_user_id: entry.actorUserId,
      action: entry.action,
      tenant_id: entry.tenantId ?? null,
      detail: entry.detail ?? {},
    });
  } catch {
    /* the log must never stop the action */
  }
}

/** The group a hotel belongs to, with its hotel count (for the hotel's own Settings card). */
export async function getHotelGroupInfo(tenantId: string): Promise<{ group: GroupSummary; hotelCount: number } | null> {
  const service = createServerSupabaseClient();
  const { data: link, error } = await service.schema("hotel").from("hotel_group_hotels").select("group_id").eq("tenant_id", tenantId).maybeSingle();
  if (error || !link) return null;
  const [{ data: group }, { count }] = await Promise.all([
    service.schema("hotel").from("hotel_groups").select("id, name, slug, base_currency").eq("id", link.group_id).maybeSingle(),
    service.schema("hotel").from("hotel_group_hotels").select("tenant_id", { count: "exact", head: true }).eq("group_id", link.group_id),
  ]);
  if (!group) return null;
  return { group: { id: group.id as string, name: group.name as string, slug: group.slug as string, baseCurrency: (group.base_currency as string) || "NGN" }, hotelCount: count ?? 1 };
}
