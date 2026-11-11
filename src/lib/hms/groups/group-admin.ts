import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { findAuthUserByEmail } from "@/lib/auth/account-codes";
import { badge, detailsPanel, EMAIL_SITE_URL } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { logGroupAction, type GroupAccessContext } from "./group-access";
import { GROUP_ROLE_LABELS, isGroupRole, type GroupRole } from "./group-types";

/*
 * Running a group: name, invitations, people and their roles, what hotels share, and the activity
 * log. Every function here is called after requireGroupApi has checked the caller's role.
 * Sharing, joining and leaving go through database functions with the caller's own token, so the
 * database checks the caller too.
 */

export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function inviteLink(token: string) {
  return `${EMAIL_SITE_URL}/hms-group/invite/${token}`;
}

export type GroupInviteRow = {
  id: string;
  tenantId: string;
  hotelName: string;
  hotelSlug: string;
  createdAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  /** Still waiting for the hotel's owner (not used, cancelled or expired). */
  open: boolean;
};

export type GroupMemberRow = { id: string; userId: string; email: string; name: string | null; role: GroupRole; receivesReports: boolean; createdAt: string };

export type GroupAuditRow = { id: string; action: string; actor: string | null; hotelName: string | null; detail: Record<string, unknown>; createdAt: string };

export async function renameGroup(ctx: GroupAccessContext, name: string) {
  const clean = name.trim();
  if (clean.length < 2 || clean.length > 120) throw new Error("Give the group a name of 2 to 120 characters.");
  const { error } = await ctx.service.schema("hotel").from("hotel_groups").update({ name: clean, updated_at: new Date().toISOString() }).eq("id", ctx.group.id);
  if (error) throw new Error(error.message);
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "group_renamed", detail: { from: ctx.group.name, to: clean } });
}

/** Finds a hotel to invite by its web address name (slug). */
async function findHotelBySlug(service: SupabaseClient, slug: string) {
  const clean = slug.trim().toLowerCase().replace(/^\/+|\/+$/g, "").replace(/^.*\/hms\//, "").split("/")[0];
  if (!clean) return null;
  const { data } = await service
    .from("tenants")
    .select("id, subdomain, name, display_name, pricing_setup")
    .eq("product", "hotel")
    .or(`subdomain.eq.${clean.replace(/[^a-z0-9-]/g, "")},name.eq.${clean.replace(/[^a-z0-9-]/g, "")}`)
    .maybeSingle();
  return data;
}

/**
 * Creates an invitation for another hotel. Only that hotel's owner can accept it. Returns the link
 * (shown once to the group owner) and emails it to the hotel's owners when it can.
 */
export async function createGroupInvite(ctx: GroupAccessContext, hotelSlug: string, note: string | null) {
  const hotel = await findHotelBySlug(ctx.service, hotelSlug);
  if (!hotel) throw new Error("No hotel with that web address. Use the name after /hms/ in the hotel's address.");
  const tenantId = hotel.id as string;
  if (ctx.hotels.some((h) => h.tenantId === tenantId)) throw new Error("That hotel is already in this group.");
  const currency = String((hotel.pricing_setup as Record<string, unknown> | null)?.currency || "NGN").toUpperCase();
  if (currency !== ctx.group.baseCurrency.toUpperCase()) {
    throw new Error(`That hotel works in ${currency} and the group in ${ctx.group.baseCurrency}. Hotels in a group must use the same currency.`);
  }

  // One live invitation per hotel: cancel any earlier one.
  await ctx.service
    .schema("hotel")
    .from("hotel_group_invites")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("group_id", ctx.group.id)
    .eq("tenant_id", tenantId)
    .is("accepted_at", null)
    .is("cancelled_at", null);

  const token = randomBytes(24).toString("base64url");
  const { error } = await ctx.service.schema("hotel").from("hotel_group_invites").insert({
    group_id: ctx.group.id,
    tenant_id: tenantId,
    token_hash: hashInviteToken(token),
    invited_by: ctx.userId,
    note: note?.trim() || null,
  });
  if (error) throw new Error(error.message);
  const hotelName = ((hotel.display_name as string) || (hotel.name as string) || (hotel.subdomain as string) || "the hotel").trim();
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "invite_created", tenantId, detail: { hotel: hotelName } });

  const link = inviteLink(token);
  let emailed = 0;
  const { data: owners } = await ctx.service.schema("hotel").from("memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "owner");
  for (const o of owners ?? []) {
    try {
      const { data } = await ctx.service.auth.admin.getUserById(o.user_id as string);
      const email = data.user?.email;
      if (!email) continue;
      await sendBrandedEmail({
        to: email,
        subject: `${ctx.group.name} invites ${hotelName} to join its hotel group`,
        text: `${ctx.group.name} has invited ${hotelName} to join its hotel group on XYVOO.\n\nJoining lets the group's managers see ${hotelName}'s figures in the group dashboard, reports and accounts. Guest profiles, loyalty and rates are shared between hotels only if the group owner switches that on. You can leave the group at any time.\n\nOnly an owner of ${hotelName} can accept. Open: ${link}\n\nThe link works for 14 days.`,
        layout: {
          preheader: `Join ${ctx.group.name} on XYVOO`,
          badges: [badge("Hotel group invitation", "blue")],
          title: `Join ${ctx.group.name}?`,
          intro: `${ctx.group.name} has invited ${hotelName} to join its hotel group. Only an owner of ${hotelName} can accept.`,
          body: detailsPanel([
            { label: "Group managers will see", value: "This hotel's dashboard figures, reports and accounts (read only)" },
            { label: "Shared with other hotels", value: "Nothing unless the group owner switches on guest profiles, loyalty or rates" },
            { label: "Leaving", value: "At any time, from Settings in your hotel" },
            ...(note?.trim() ? [{ label: "Note", value: note.trim() }] : []),
          ]),
          buttons: [{ label: "Review the invitation", href: link }],
          footerNote: `You get this because you own ${hotelName} on XYVOO. The link works for 14 days.`,
        },
      });
      emailed += 1;
    } catch {
      /* the link is shown on screen as well */
    }
  }
  return { link, hotelName, emailed };
}

export async function cancelGroupInvite(ctx: GroupAccessContext, inviteId: string) {
  const { data, error } = await ctx.service
    .schema("hotel")
    .from("hotel_group_invites")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("group_id", ctx.group.id)
    .is("accepted_at", null)
    .select("tenant_id")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That invitation can't be cancelled.");
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "invite_cancelled", tenantId: data.tenant_id as string });
}

export async function listGroupInvites(ctx: GroupAccessContext): Promise<GroupInviteRow[]> {
  const { data } = await ctx.service
    .schema("hotel")
    .from("hotel_group_invites")
    .select("id, tenant_id, created_at, expires_at, accepted_at, cancelled_at")
    .eq("group_id", ctx.group.id)
    .order("created_at", { ascending: false })
    .limit(50);
  const ids = [...new Set((data ?? []).map((r) => r.tenant_id as string))];
  const { data: tenants } = ids.length
    ? await ctx.service.from("tenants").select("id, subdomain, name, display_name").in("id", ids)
    : { data: [] as Array<Record<string, unknown>> };
  const names = new Map((tenants ?? []).map((t) => [t.id as string, t]));
  return (data ?? []).map((r) => {
    const t = names.get(r.tenant_id as string);
    return {
      id: r.id as string,
      tenantId: r.tenant_id as string,
      hotelName: ((t?.display_name as string) || (t?.name as string) || (t?.subdomain as string) || "Hotel").trim(),
      hotelSlug: ((t?.subdomain as string) || (t?.name as string) || "") as string,
      createdAt: r.created_at as string,
      expiresAt: r.expires_at as string,
      acceptedAt: (r.accepted_at as string) ?? null,
      cancelledAt: (r.cancelled_at as string) ?? null,
      open: !r.accepted_at && !r.cancelled_at && new Date(r.expires_at as string).getTime() > Date.now(),
    };
  });
}

export async function listGroupMembers(ctx: GroupAccessContext): Promise<GroupMemberRow[]> {
  const { data } = await ctx.service
    .schema("hotel")
    .from("hotel_group_members")
    .select("id, user_id, role, receives_reports, created_at")
    .eq("group_id", ctx.group.id)
    .order("created_at", { ascending: true });
  const rows: GroupMemberRow[] = [];
  for (const r of data ?? []) {
    if (!isGroupRole(r.role)) continue;
    let email = "";
    let name: string | null = null;
    try {
      const { data: u } = await ctx.service.auth.admin.getUserById(r.user_id as string);
      email = u.user?.email ?? "";
      const full = u.user?.user_metadata?.full_name;
      name = typeof full === "string" && full.trim() ? full.trim() : null;
    } catch {
      /* show the row without a name */
    }
    rows.push({ id: r.id as string, userId: r.user_id as string, email, name, role: r.role, receivesReports: Boolean(r.receives_reports), createdAt: r.created_at as string });
  }
  return rows;
}

async function ownerCount(ctx: GroupAccessContext) {
  const { count } = await ctx.service.schema("hotel").from("hotel_group_members").select("id", { count: "exact", head: true }).eq("group_id", ctx.group.id).eq("role", "group_owner");
  return count ?? 0;
}

/** Adds an existing XYVOO login (found by email) to the group with a role. */
export async function addGroupMember(ctx: GroupAccessContext, email: string, role: GroupRole) {
  const found = await findAuthUserByEmail(email.trim().toLowerCase());
  if (!found) throw new Error("No XYVOO login with that email. They need a login first (for example a hotel login made under Settings, Staff).");
  const { error } = await ctx.service.schema("hotel").from("hotel_group_members").insert({ group_id: ctx.group.id, user_id: found.id, role, added_by: ctx.userId });
  if (error) {
    if (/duplicate|unique/i.test(error.message)) throw new Error("That person already has a role in this group.");
    throw new Error(error.message);
  }
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "member_added", detail: { email: found.email, role: GROUP_ROLE_LABELS[role] } });
}

export async function changeGroupMember(ctx: GroupAccessContext, memberId: string, change: { role?: GroupRole; receivesReports?: boolean }) {
  const { data: row } = await ctx.service.schema("hotel").from("hotel_group_members").select("id, user_id, role").eq("id", memberId).eq("group_id", ctx.group.id).maybeSingle();
  if (!row) throw new Error("That person isn't in this group.");
  if (change.role && row.role === "group_owner" && change.role !== "group_owner" && (await ownerCount(ctx)) <= 1) {
    throw new Error("A group needs at least one owner. Make someone else owner first.");
  }
  const patch: Record<string, unknown> = {};
  if (change.role) patch.role = change.role;
  if (typeof change.receivesReports === "boolean") patch.receives_reports = change.receivesReports;
  const { error } = await ctx.service.schema("hotel").from("hotel_group_members").update(patch).eq("id", memberId);
  if (error) throw new Error(error.message);
  if (change.role && change.role !== row.role) {
    await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "member_role_changed", detail: { user_id: row.user_id, from: row.role, to: change.role } });
  }
}

export async function removeGroupMember(ctx: GroupAccessContext, memberId: string) {
  const { data: row } = await ctx.service.schema("hotel").from("hotel_group_members").select("id, user_id, role").eq("id", memberId).eq("group_id", ctx.group.id).maybeSingle();
  if (!row) throw new Error("That person isn't in this group.");
  if (row.role === "group_owner" && (await ownerCount(ctx)) <= 1) throw new Error("A group needs at least one owner.");
  const { error } = await ctx.service.schema("hotel").from("hotel_group_members").delete().eq("id", memberId);
  if (error) throw new Error(error.message);
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "member_removed", detail: { user_id: row.user_id, role: row.role } });
}

/** Sharing switches go through the database function, which checks the caller is the group owner. */
export async function setGroupSharing(ctx: GroupAccessContext, next: { shareGuests: boolean; shareLoyalty: boolean; shareRates: boolean; matchByPhone: boolean }) {
  const { error } = await ctx.userDb.schema("hotel").rpc("set_hotel_group_sharing", {
    p_group: ctx.group.id,
    p_guests: next.shareGuests,
    p_loyalty: next.shareLoyalty && next.shareGuests,
    p_rates: next.shareRates,
    p_phone: next.matchByPhone,
  });
  if (error) throw new Error(error.message);
}

/** Takes a hotel out of the group (database checks the caller is the group owner or hotel owner). */
export async function removeHotelFromGroup(userDb: SupabaseClient, tenantId: string) {
  const { error } = await userDb.schema("hotel").rpc("leave_hotel_group", { p_tenant: tenantId });
  if (error) throw new Error(error.message);
}

/** Accepts an invitation as the signed-in user (database checks they own the invited hotel). */
export async function acceptGroupInvite(userDb: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await userDb.schema("hotel").rpc("accept_hotel_group_invite", { p_token_hash: hashInviteToken(token) });
  if (error) throw new Error(error.message);
  return data as string;
}

/** What an invitation is for, to show before accepting. Null when the token is unknown. */
export async function describeInvite(service: SupabaseClient, token: string) {
  const { data: inv } = await service
    .schema("hotel")
    .from("hotel_group_invites")
    .select("id, group_id, tenant_id, expires_at, accepted_at, cancelled_at, note")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();
  if (!inv) return null;
  const [{ data: group }, { data: hotel }, { count }] = await Promise.all([
    service.schema("hotel").from("hotel_groups").select("name, slug").eq("id", inv.group_id).maybeSingle(),
    service.from("tenants").select("id, subdomain, name, display_name").eq("id", inv.tenant_id).maybeSingle(),
    service.schema("hotel").from("hotel_group_hotels").select("tenant_id", { count: "exact", head: true }).eq("group_id", inv.group_id),
  ]);
  const state = inv.cancelled_at ? "cancelled" : inv.accepted_at ? "accepted" : new Date(inv.expires_at as string).getTime() < Date.now() ? "expired" : "open";
  return {
    state: state as "open" | "accepted" | "cancelled" | "expired",
    groupName: (group?.name as string) ?? "A hotel group",
    groupSlug: (group?.slug as string) ?? "",
    groupHotelCount: count ?? 0,
    tenantId: inv.tenant_id as string,
    hotelName: ((hotel?.display_name as string) || (hotel?.name as string) || (hotel?.subdomain as string) || "your hotel").trim(),
    hotelSlug: ((hotel?.subdomain as string) || (hotel?.name as string) || "") as string,
    note: (inv.note as string) ?? null,
    expiresAt: inv.expires_at as string,
  };
}

export async function listGroupAudit(ctx: GroupAccessContext, limit = 100): Promise<GroupAuditRow[]> {
  const { data } = await ctx.service
    .schema("hotel")
    .from("hotel_group_audit")
    .select("id, action, actor_user_id, tenant_id, detail, created_at")
    .eq("group_id", ctx.group.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  const actorIds = [...new Set((data ?? []).map((r) => r.actor_user_id as string | null).filter((x): x is string => Boolean(x)))];
  const actors = new Map<string, string>();
  for (const id of actorIds) {
    try {
      const { data: u } = await ctx.service.auth.admin.getUserById(id);
      const full = u.user?.user_metadata?.full_name;
      actors.set(id, (typeof full === "string" && full.trim()) || u.user?.email || "Someone");
    } catch {
      actors.set(id, "Someone");
    }
  }
  const hotelNames = new Map(ctx.hotels.map((h) => [h.tenantId, h.name]));
  return (data ?? []).map((r) => ({
    id: r.id as string,
    action: r.action as string,
    actor: r.actor_user_id ? actors.get(r.actor_user_id as string) ?? null : null,
    hotelName: r.tenant_id ? hotelNames.get(r.tenant_id as string) ?? "A hotel no longer in the group" : null,
    detail: (r.detail as Record<string, unknown>) ?? {},
    createdAt: r.created_at as string,
  }));
}
