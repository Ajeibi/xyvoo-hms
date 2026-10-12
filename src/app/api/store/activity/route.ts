import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { activityDetails, activitySentence, isActivityArea, type ActivityChanges } from "@/lib/store/activity-text";
import { featureUnavailable } from "@/lib/store/features";

const PAGE_SIZE = 50;
const isDay = (v: string | null): v is string => Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));

/**
 * GET /api/store/activity?slug=&q=&area=&person=&from=&to=&page= — the
 * activity log, newest first, as readable sentences. Owners and admins on the
 * Standard plan.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service, capabilities } = resolved;
  if (!capabilities.canViewActivity) return NextResponse.json({ error: "Only the owner or an admin can see the activity log." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "activityLog");
  if (blocked) return blocked;

  const area = url.searchParams.get("area");
  const person = url.searchParams.get("person");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const page = Math.max(1, Math.min(200, Number(url.searchParams.get("page")) || 1));
  // Only letters, numbers, spaces and a few safe marks reach the filter, so the search can't change the query.
  const q = (url.searchParams.get("q") || "").replace(/[^\p{L}\p{N} @._'-]/gu, " ").trim().slice(0, 80);

  let query = service
    .schema("store")
    .from("activity_log")
    .select("id, actor_user_id, actor_name, area, action, target_label, changes, created_at", { count: "exact" })
    .eq("tenant_id", access.tenantId)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (isActivityArea(area)) query = query.eq("area", area);
  if (person && /^[0-9a-f-]{36}$/i.test(person)) query = query.eq("actor_user_id", person);
  if (isDay(from)) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (isDay(to)) query = query.lt("created_at", new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString());
  if (q) query = query.or(`target_label.ilike.%${q}%,actor_name.ilike.%${q}%`);

  const [{ data, count, error }, { data: profile }, { data: actors }] = await Promise.all([
    query,
    service.schema("store").from("business_profile").select("currency_code").eq("tenant_id", access.tenantId).maybeSingle(),
    // Everyone who appears in the log, for the "person" filter (including people who have since left).
    service.schema("store").from("activity_log").select("actor_user_id, actor_name").eq("tenant_id", access.tenantId).not("actor_user_id", "is", null).order("created_at", { ascending: false }).limit(500),
  ]);
  if (error) {
    console.error("[activity] list failed", error);
    return NextResponse.json({ error: "We couldn't load the activity log. Please try again." }, { status: 500 });
  }

  const currency = (profile?.currency_code as string | null) || "NGN";
  const people = new Map<string, string>();
  for (const a of actors || []) if (a.actor_user_id && !people.has(a.actor_user_id)) people.set(a.actor_user_id, a.actor_name || "Someone");

  return NextResponse.json({
    entries: (data || []).map((e) => ({
      id: e.id,
      area: e.area,
      actorName: e.actor_name,
      sentence: activitySentence(e as { actor_name: string; area: string; action: string; target_label: string | null; changes: ActivityChanges }, currency),
      details: activityDetails(e.changes as ActivityChanges, currency),
      createdAt: e.created_at,
    })),
    total: count ?? 0,
    page,
    pageSize: PAGE_SIZE,
    people: [...people.entries()].map(([id, name]) => ({ id, name })),
  });
}
