import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/hms/reports/load";
import { loadGuestMetrics } from "@/lib/hms/guest-metrics";
import { logGroupAction, type GroupAccessContext } from "./group-access";
import { normaliseEmail, normalisePhone, planGuestMatches, type ExistingLink, type MatchGuest } from "./group-guest-matching";

/*
 * Shared guest profiles.
 *
 * The matching job (system work, service key) reads each hotel's guests, links the same person across
 * hotels and copies a shareable summary onto each link. People only ever read the links and profiles,
 * with their own token, so row-level security decides what they see: nothing from another hotel
 * unless the group shares guest profiles.
 */

export type GuestLinkView = {
  linkId: string;
  profileId: string;
  tenantId: string;
  hotelName: string;
  guestId: string;
  guestName: string;
  method: string;
  stays: number;
  nights: number;
  spend: number;
  lastStayAt: string | null;
  vip: boolean;
  preferences: string | null;
  accessibility: string[];
};

export type GroupGuestProfileView = { profileId: string; displayName: string; links: GuestLinkView[]; totalStays: number; totalNights: number; totalSpend: number; lastStayAt: string | null; vip: boolean };

export type GuestSuggestionView = { matchKey: string; reason: string; guests: Array<{ id: string; tenantId: string; hotelName: string; guestId: string; guestName: string }> };

const LINK_SELECT = "id, profile_id, tenant_id, guest_id, method, guest_name, stays, nights, spend, last_stay_at, vip, preferences, accessibility";

function toLink(r: Record<string, unknown>, hotelNames: Map<string, string>): GuestLinkView {
  return {
    linkId: r.id as string,
    profileId: r.profile_id as string,
    tenantId: r.tenant_id as string,
    hotelName: hotelNames.get(r.tenant_id as string) ?? "Another hotel",
    guestId: r.guest_id as string,
    guestName: (r.guest_name as string) || "Guest",
    method: r.method as string,
    stays: Number(r.stays) || 0,
    nights: Number(r.nights) || 0,
    spend: Number(r.spend) || 0,
    lastStayAt: (r.last_stay_at as string) ?? null,
    vip: Boolean(r.vip),
    preferences: (r.preferences as string) || null,
    accessibility: Array.isArray(r.accessibility) ? (r.accessibility as string[]) : [],
  };
}

function foldProfiles(links: GuestLinkView[], names: Map<string, string>): GroupGuestProfileView[] {
  const by = new Map<string, GuestLinkView[]>();
  for (const l of links) (by.get(l.profileId) ?? by.set(l.profileId, []).get(l.profileId)!).push(l);
  return [...by.entries()].map(([profileId, ls]) => ({
    profileId,
    displayName: names.get(profileId) ?? ls[0]?.guestName ?? "Guest",
    links: ls.sort((a, b) => a.hotelName.localeCompare(b.hotelName)),
    totalStays: ls.reduce((s, l) => s + l.stays, 0),
    totalNights: ls.reduce((s, l) => s + l.nights, 0),
    totalSpend: Math.round(ls.reduce((s, l) => s + l.spend, 0) * 100) / 100,
    lastStayAt: ls.map((l) => l.lastStayAt).filter((x): x is string => Boolean(x)).sort().at(-1) ?? null,
    vip: ls.some((l) => l.vip),
  }));
}

/* ---------- the matching job (service key; system work) ---------- */

type GuestRow = { id: string; tenant_id: string; first_name: string; last_name: string; email: string | null; phone: string | null; tags: unknown; preferences: string | null; accessibility_flags: string[] | null; anonymised_at: string | null };

async function loadGroupGuests(service: SupabaseClient, tenantIds: string[]) {
  const all: GuestRow[] = [];
  for (const tenantId of tenantIds) {
    const rows = await fetchAll<GuestRow>((a, b) =>
      service
        .schema("hotel")
        .from("guests")
        .select("id, tenant_id, first_name, last_name, email, phone, tags, preferences, accessibility_flags, anonymised_at")
        .eq("tenant_id", tenantId)
        .order("id")
        .range(a, b),
    );
    all.push(...rows);
  }
  return all;
}

function isVip(tags: unknown) {
  return Array.isArray(tags) && tags.some((t) => String(t).toLowerCase() === "vip");
}

/** Refreshes the shareable summary on every link in the group (stays, nights, spend, VIP...). */
export async function refreshLinkSummaries(service: SupabaseClient, groupId: string) {
  const { data: links } = await service.schema("hotel").from("hotel_group_guest_links").select("id, tenant_id, guest_id").eq("group_id", groupId);
  const byTenant = new Map<string, Array<{ id: string; guestId: string }>>();
  for (const l of links ?? []) (byTenant.get(l.tenant_id as string) ?? byTenant.set(l.tenant_id as string, []).get(l.tenant_id as string)!).push({ id: l.id as string, guestId: l.guest_id as string });
  let updated = 0;
  for (const [tenantId, list] of byTenant) {
    const ids = list.map((l) => l.guestId);
    const [metrics, { data: guests }] = await Promise.all([
      loadGuestMetrics(service, tenantId, ids),
      service.schema("hotel").from("guests").select("id, first_name, last_name, tags, preferences, accessibility_flags").in("id", ids),
    ]);
    const gById = new Map((guests ?? []).map((g) => [g.id as string, g]));
    for (const l of list) {
      const m = metrics.get(l.guestId);
      const g = gById.get(l.guestId);
      await service
        .schema("hotel")
        .from("hotel_group_guest_links")
        .update({
          guest_name: g ? `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim() : null,
          stays: m ? m.staysStarted : 0,
          nights: m ? m.nights : 0,
          spend: m ? m.spend : 0,
          last_stay_at: m?.lastStayAt ?? null,
          vip: g ? isVip(g.tags) || Boolean(m?.hasVipStay) : false,
          preferences: (g?.preferences as string) || null,
          accessibility: (g?.accessibility_flags as string[]) ?? [],
          summary_updated_at: new Date().toISOString(),
        })
        .eq("id", l.id);
      updated += 1;
    }
  }
  return updated;
}

/** Links the same guest across the group's hotels. Does nothing unless the group shares guest profiles. */
export async function runGuestMatching(service: SupabaseClient, groupId: string, actorUserId: string | null) {
  const { data: sharing } = await service.schema("hotel").from("hotel_group_sharing").select("share_guests, match_by_phone").eq("group_id", groupId).maybeSingle();
  if (!sharing?.share_guests) return { skipped: true as const, linked: 0, profiles: 0, suggestions: 0, refreshed: 0 };

  const { data: hotelRows } = await service.schema("hotel").from("hotel_group_hotels").select("tenant_id").eq("group_id", groupId);
  const tenantIds = (hotelRows ?? []).map((h) => h.tenant_id as string);
  if (tenantIds.length < 2) return { skipped: true as const, linked: 0, profiles: 0, suggestions: 0, refreshed: 0 };

  const [guests, { data: optouts }, { data: linkRows }, { data: profileRows }] = await Promise.all([
    loadGroupGuests(service, tenantIds),
    service.schema("hotel").from("hotel_group_guest_optouts").select("guest_id").in("tenant_id", tenantIds),
    service.schema("hotel").from("hotel_group_guest_links").select("profile_id, tenant_id, guest_id").eq("group_id", groupId),
    service.schema("hotel").from("hotel_group_guest_profiles").select("id, match_email, match_phone").eq("group_id", groupId),
  ]);
  const optedOut = new Set((optouts ?? []).map((o) => o.guest_id as string));
  const profiles = new Map((profileRows ?? []).map((p) => [p.id as string, p]));
  const existing: ExistingLink[] = (linkRows ?? []).map((l) => {
    const p = profiles.get(l.profile_id as string);
    return { profileId: l.profile_id as string, tenantId: l.tenant_id as string, guestId: l.guest_id as string, matchEmail: (p?.match_email as string) ?? null, matchPhone: (p?.match_phone as string) ?? null };
  });
  // Profiles with no links left still own their email/phone key.
  for (const p of profileRows ?? []) {
    if (!existing.some((e) => e.profileId === p.id)) existing.push({ profileId: p.id as string, tenantId: "", guestId: "", matchEmail: (p.match_email as string) ?? null, matchPhone: (p.match_phone as string) ?? null });
  }

  const candidates: MatchGuest[] = guests
    .filter((g) => !g.anonymised_at && !optedOut.has(g.id))
    .map((g) => ({ tenantId: g.tenant_id, guestId: g.id, firstName: g.first_name ?? "", lastName: g.last_name ?? "", email: g.email, phone: g.phone }));
  const plan = planGuestMatches(candidates, existing, { matchByPhone: Boolean(sharing.match_by_phone) });

  let linked = 0;
  for (const np of plan.newProfiles) {
    const { data: profile, error } = await service
      .schema("hotel")
      .from("hotel_group_guest_profiles")
      .insert({ group_id: groupId, display_name: np.displayName, match_email: np.matchEmail, match_phone: np.matchPhone })
      .select("id")
      .single();
    if (error || !profile) continue;
    const { error: linkError } = await service
      .schema("hotel")
      .from("hotel_group_guest_links")
      .upsert(np.guests.map((g) => ({ profile_id: profile.id, group_id: groupId, tenant_id: g.tenantId, guest_id: g.guestId, method: g.method, linked_by: actorUserId })), { onConflict: "guest_id", ignoreDuplicates: true });
    if (!linkError) linked += np.guests.length;
  }
  if (plan.addToExisting.length) {
    const { error } = await service
      .schema("hotel")
      .from("hotel_group_guest_links")
      .upsert(plan.addToExisting.map((g) => ({ profile_id: g.profileId, group_id: groupId, tenant_id: g.tenantId, guest_id: g.guestId, method: g.method, linked_by: actorUserId })), { onConflict: "guest_id", ignoreDuplicates: true });
    if (!error) linked += plan.addToExisting.length;
  }
  if (plan.suggestions.length) {
    await service
      .schema("hotel")
      .from("hotel_group_guest_suggestions")
      .upsert(
        plan.suggestions.map((s) => ({ group_id: groupId, match_key: s.profileKey, profile_id: s.profileId, tenant_id: s.tenantId, guest_id: s.guestId, reason: s.reason })),
        { onConflict: "group_id,match_key,guest_id", ignoreDuplicates: true },
      );
  }
  const refreshed = await refreshLinkSummaries(service, groupId);
  await logGroupAction(service, { groupId, actorUserId, action: "guest_matching_run", detail: { linked, profiles: plan.newProfiles.length, suggestions: plan.suggestions.length } });
  return { skipped: false as const, linked, profiles: plan.newProfiles.length, suggestions: plan.suggestions.length, refreshed };
}

/* ---------- what people read (their own token) ---------- */

/** The group's guest directory, for group owners and admins. Row-level security limits the rows. */
export async function loadGroupGuestDirectory(ctx: GroupAccessContext, search: string, limit = 200): Promise<GroupGuestProfileView[]> {
  const db = ctx.userDb.schema("hotel");
  let profilesQuery = db.from("hotel_group_guest_profiles").select("id, display_name").eq("group_id", ctx.group.id).order("display_name").limit(limit);
  const q = search.trim();
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    profilesQuery = profilesQuery.or(`display_name.ilike.%${safe}%,match_email.ilike.%${safe}%`);
  }
  const { data: profiles, error } = await profilesQuery;
  if (error) throw new Error(error.message);
  const ids = (profiles ?? []).map((p) => p.id as string);
  if (!ids.length) return [];
  const { data: links, error: linkError } = await db.from("hotel_group_guest_links").select(LINK_SELECT).in("profile_id", ids);
  if (linkError) throw new Error(linkError.message);
  const hotelNames = new Map(ctx.hotels.map((h) => [h.tenantId, h.name]));
  const names = new Map((profiles ?? []).map((p) => [p.id as string, p.display_name as string]));
  return foldProfiles(((links ?? []) as Array<Record<string, unknown>>).map((l) => toLink(l, hotelNames)), names).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function loadGuestSuggestions(ctx: GroupAccessContext): Promise<GuestSuggestionView[]> {
  const { data } = await ctx.userDb
    .schema("hotel")
    .from("hotel_group_guest_suggestions")
    .select("id, match_key, tenant_id, guest_id, reason")
    .eq("group_id", ctx.group.id)
    .is("dismissed_at", null)
    .limit(300);
  const rows = (data ?? []) as Array<Record<string, unknown>>;
  if (!rows.length) return [];
  // Names come from the service key: suggestions are only shown to group owners and admins.
  const { data: guests } = await ctx.service.schema("hotel").from("guests").select("id, first_name, last_name").in("id", rows.map((r) => r.guest_id as string));
  const gName = new Map((guests ?? []).map((g) => [g.id as string, `${g.first_name ?? ""} ${g.last_name ?? ""}`.trim() || "Guest"]));
  const hotelNames = new Map(ctx.hotels.map((h) => [h.tenantId, h.name]));
  const by = new Map<string, GuestSuggestionView>();
  for (const r of rows) {
    const key = r.match_key as string;
    const s = by.get(key) ?? { matchKey: key, reason: r.reason as string, guests: [] };
    s.guests.push({ id: r.id as string, tenantId: r.tenant_id as string, hotelName: hotelNames.get(r.tenant_id as string) ?? "Hotel", guestId: r.guest_id as string, guestName: gName.get(r.guest_id as string) ?? "Guest" });
    by.set(key, s);
  }
  return [...by.values()].filter((s) => new Set(s.guests.map((g) => g.tenantId)).size > 1);
}

/** Confirms a suggestion: links its guests under one profile (an existing one when there is). */
export async function confirmSuggestion(ctx: GroupAccessContext, matchKey: string) {
  const { data: rows } = await ctx.service
    .schema("hotel")
    .from("hotel_group_guest_suggestions")
    .select("id, profile_id, tenant_id, guest_id")
    .eq("group_id", ctx.group.id)
    .eq("match_key", matchKey)
    .is("dismissed_at", null);
  if (!rows?.length) throw new Error("Nothing to confirm.");
  let profileId = (rows.find((r) => r.profile_id)?.profile_id as string) ?? null;
  if (!profileId) {
    const { data: first } = await ctx.service.schema("hotel").from("guests").select("first_name, last_name, phone").eq("id", rows[0].guest_id).maybeSingle();
    const { data: profile, error } = await ctx.service
      .schema("hotel")
      .from("hotel_group_guest_profiles")
      .insert({ group_id: ctx.group.id, display_name: `${first?.first_name ?? ""} ${first?.last_name ?? ""}`.trim() || "Guest", match_phone: normalisePhone(first?.phone as string) })
      .select("id")
      .single();
    if (error || !profile) throw new Error(error?.message ?? "Couldn't make the profile.");
    profileId = profile.id as string;
  }
  const { error } = await ctx.service
    .schema("hotel")
    .from("hotel_group_guest_links")
    .upsert(rows.map((r) => ({ profile_id: profileId, group_id: ctx.group.id, tenant_id: r.tenant_id, guest_id: r.guest_id, method: "manual", linked_by: ctx.userId })), { onConflict: "guest_id", ignoreDuplicates: true });
  if (error) throw new Error(error.message);
  await ctx.service.schema("hotel").from("hotel_group_guest_suggestions").delete().eq("group_id", ctx.group.id).eq("match_key", matchKey);
  await refreshLinkSummaries(ctx.service, ctx.group.id);
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "guest_linked", detail: { guests: rows.length, method: "manual" } });
}

export async function dismissSuggestion(ctx: GroupAccessContext, matchKey: string) {
  await ctx.service
    .schema("hotel")
    .from("hotel_group_guest_suggestions")
    .update({ dismissed_at: new Date().toISOString(), dismissed_by: ctx.userId })
    .eq("group_id", ctx.group.id)
    .eq("match_key", matchKey);
}

/** Unlinks one hotel's guest from a profile. The profile goes when one hotel or none is left. */
export async function unlinkGuest(ctx: GroupAccessContext, linkId: string) {
  const { data: link } = await ctx.service.schema("hotel").from("hotel_group_guest_links").select("id, profile_id, tenant_id, guest_id").eq("id", linkId).eq("group_id", ctx.group.id).maybeSingle();
  if (!link) throw new Error("That link isn't in this group.");
  await ctx.service.schema("hotel").from("hotel_group_guest_links").delete().eq("id", linkId);
  // Keep the guest out of automatic matching from now on (a person decided they're not the same).
  await ctx.service.schema("hotel").from("hotel_group_guest_optouts").upsert({ tenant_id: link.tenant_id, guest_id: link.guest_id, reason: "Unlinked by the group", created_by: ctx.userId }, { onConflict: "tenant_id,guest_id", ignoreDuplicates: true });
  const { data: left } = await ctx.service.schema("hotel").from("hotel_group_guest_links").select("tenant_id").eq("profile_id", link.profile_id);
  if (new Set((left ?? []).map((l) => l.tenant_id)).size < 2) {
    await ctx.service.schema("hotel").from("hotel_group_guest_profiles").delete().eq("id", link.profile_id);
  }
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "guest_unlinked", tenantId: link.tenant_id as string });
}

/**
 * For a hotel's guest page: the same person at the group's other hotels, read with the signed-in
 * user's token. Empty unless the group shares guest profiles (the database returns nothing else).
 */
export async function loadKnownInGroup(userDb: SupabaseClient, tenantId: string, guestId: string): Promise<{ profile: GroupGuestProfileView | null; optedOut: boolean; linkedHere: boolean }> {
  const db = userDb.schema("hotel");
  const [{ data: own }, { data: optout }] = await Promise.all([
    db.from("hotel_group_guest_links").select("profile_id").eq("tenant_id", tenantId).eq("guest_id", guestId).maybeSingle(),
    db.from("hotel_group_guest_optouts").select("guest_id").eq("tenant_id", tenantId).eq("guest_id", guestId).maybeSingle(),
  ]);
  if (!own?.profile_id) return { profile: null, optedOut: Boolean(optout), linkedHere: false };
  const [{ data: links }, { data: hotels }] = await Promise.all([
    db.from("hotel_group_guest_links").select(LINK_SELECT).eq("profile_id", own.profile_id),
    db.rpc("group_hotel_list", { p_group: (await db.from("hotel_group_hotels").select("group_id").eq("tenant_id", tenantId).maybeSingle()).data?.group_id ?? null }),
  ]);
  const hotelNames = new Map(((hotels ?? []) as Array<Record<string, unknown>>).map((h) => [h.tenant_id as string, h.name as string]));
  const views = ((links ?? []) as Array<Record<string, unknown>>).map((l) => toLink(l, hotelNames));
  const others = views.filter((l) => l.tenantId !== tenantId);
  if (!others.length) return { profile: null, optedOut: Boolean(optout), linkedHere: true };
  const [profile] = foldProfiles(others, new Map());
  return { profile, optedOut: Boolean(optout), linkedHere: true };
}

/** A hotel keeps one of its guests out of the group (or lets them back in). Service key, after the hotel's own check. */
export async function setGuestGroupOptOut(service: SupabaseClient, tenantId: string, guestId: string, optOut: boolean, actorUserId: string) {
  if (optOut) {
    await service.schema("hotel").from("hotel_group_guest_optouts").upsert({ tenant_id: tenantId, guest_id: guestId, reason: "Kept out by the hotel", created_by: actorUserId }, { onConflict: "tenant_id,guest_id" });
    await service.schema("hotel").from("hotel_group_guest_links").delete().eq("tenant_id", tenantId).eq("guest_id", guestId);
    await service.schema("hotel").from("hotel_group_guest_suggestions").delete().eq("tenant_id", tenantId).eq("guest_id", guestId);
  } else {
    await service.schema("hotel").from("hotel_group_guest_optouts").delete().eq("tenant_id", tenantId).eq("guest_id", guestId);
  }
}

export { normaliseEmail };
