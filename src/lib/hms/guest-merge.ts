import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { loadGuestMetrics } from "@/lib/hms/guest-metrics";
import { findDuplicatePairs, pairKey, type DuplicateGuest, type DuplicatePair } from "@/lib/hms/guest-duplicates-shared";

/*
 * Merging duplicate guests. The work is done by one database function (hotel.merge_guests,
 * migration 20261202150000) so it is all-or-nothing. It moves every record that points at the
 * guest being removed: bookings (reservation_guests), notes, requests' waitlist and incident
 * links, ID photos, messages, feedback, online check-ins, consent history, loyalty points and
 * data requests, then fills gaps on the kept guest and removes the other one.
 */

const PAGE = 1000;

export type DuplicateSide = {
  id: string;
  name: string;
  phone: string;
  email: string;
  idNumber: string;
  completedStays: number;
  spend: number;
  lastStayAt: string | null;
  createdAt: string;
};

export type DuplicateCandidate = DuplicatePair & { left: DuplicateSide; right: DuplicateSide };

export async function listDuplicateCandidates(service: SupabaseClient, tenantId: string, limit = 60): Promise<DuplicateCandidate[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await service
      .schema("hotel")
      .from("guests")
      .select("id,title,first_name,last_name,phone,email,id_number,date_of_birth,created_at")
      .eq("tenant_id", tenantId)
      .order("id")
      .range(from, from + PAGE - 1);
    rows.push(...((data ?? []) as Record<string, unknown>[]));
    if ((data ?? []).length < PAGE) break;
  }
  const real = rows.filter((r) => r.first_name !== "Erased");

  const dismissed = new Set<string>();
  const { data: dis } = await service.schema("hotel").from("guest_duplicate_dismissals").select("guest_a,guest_b").eq("tenant_id", tenantId);
  for (const d of dis ?? []) dismissed.add(pairKey(d.guest_a as string, d.guest_b as string));

  const pairs = findDuplicatePairs(
    real.map(
      (r): DuplicateGuest => ({
        id: r.id as string,
        firstName: (r.first_name as string) ?? "",
        lastName: (r.last_name as string) ?? "",
        phone: (r.phone as string) ?? "",
        email: (r.email as string) ?? "",
        idNumber: (r.id_number as string) ?? "",
        dateOfBirth: (r.date_of_birth as string) ?? "",
      }),
    ),
    dismissed,
  ).slice(0, limit);
  if (pairs.length === 0) return [];

  const ids = [...new Set(pairs.flatMap((p) => [p.a, p.b]))];
  const metrics = await loadGuestMetrics(service, tenantId, ids);
  const byId = new Map(real.map((r) => [r.id as string, r]));
  const side = (id: string): DuplicateSide => {
    const r = byId.get(id) as Record<string, unknown>;
    const m = metrics.get(id);
    return {
      id,
      name: `${r.title ? `${r.title} ` : ""}${r.first_name} ${r.last_name}`.trim(),
      phone: (r.phone as string) ?? "",
      email: (r.email as string) ?? "",
      idNumber: (r.id_number as string) ?? "",
      completedStays: m?.completedStays ?? 0,
      spend: m?.spend ?? 0,
      lastStayAt: m?.lastStayAt ?? null,
      createdAt: r.created_at as string,
    };
  };
  return pairs.map((p) => ({ ...p, left: side(p.a), right: side(p.b) }));
}

export async function mergeGuests(
  service: SupabaseClient,
  params: { tenantId: string; keepId: string; dropId: string; actorUserId: string },
): Promise<{ ok: true; moved: Record<string, number> } | { ok: false; error: string }> {
  if (params.keepId === params.dropId) return { ok: false, error: "Pick two different guests." };
  const { data, error } = await service.schema("hotel").rpc("merge_guests", {
    p_tenant: params.tenantId,
    p_keep: params.keepId,
    p_drop: params.dropId,
    p_actor: params.actorUserId,
  });
  if (error) {
    const missing = /merge_guests|schema cache|does not exist/i.test(error.message);
    return { ok: false, error: missing ? "Merging isn't set up yet. The database update for it still needs to be run." : error.message };
  }
  const moved = (data ?? {}) as Record<string, number>;
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "guest_merged",
    entityType: "guest",
    entityId: params.keepId,
    after: { mergedGuestId: params.dropId, moved },
  });
  return { ok: true, moved };
}

export type RecentMerge = {
  id: string;
  keptGuestId: string;
  keptName: string;
  mergedName: string;
  mergedAt: string;
  canUndo: boolean;
};

/** Merges that have not been undone, newest first. Only merges made after the undo update can be undone. */
export async function listRecentMerges(service: SupabaseClient, tenantId: string, limit = 15): Promise<RecentMerge[]> {
  const res = await service
    .schema("hotel")
    .from("guest_merges")
    .select("id,kept_guest_id,merged_snapshot,created_at,moved_rows,undone_at")
    .eq("tenant_id", tenantId)
    .is("undone_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  // Before the undo migration is run there are no undo columns: show nothing rather than fail.
  if (res.error) return [];
  const rows = (res.data ?? []) as { id: string; kept_guest_id: string; merged_snapshot: Record<string, unknown>; created_at: string; moved_rows: unknown }[];
  if (rows.length === 0) return [];
  const { data: kept } = await service
    .schema("hotel")
    .from("guests")
    .select("id,title,first_name,last_name")
    .eq("tenant_id", tenantId)
    .in("id", [...new Set(rows.map((r) => r.kept_guest_id))]);
  const names = new Map((kept ?? []).map((g) => [g.id as string, `${g.first_name} ${g.last_name}`.trim()]));
  return rows.map((r) => ({
    id: r.id,
    keptGuestId: r.kept_guest_id,
    keptName: names.get(r.kept_guest_id) ?? "a guest",
    mergedName: `${r.merged_snapshot.first_name ?? ""} ${r.merged_snapshot.last_name ?? ""}`.trim() || "a guest",
    mergedAt: r.created_at,
    canUndo: r.moved_rows != null,
  }));
}

export async function undoGuestMerge(
  service: SupabaseClient,
  params: { tenantId: string; mergeId: string; actorUserId: string },
): Promise<{ ok: true; restored: Record<string, number> } | { ok: false; error: string }> {
  const { data, error } = await service.schema("hotel").rpc("undo_guest_merge", { p_tenant: params.tenantId, p_merge: params.mergeId, p_actor: params.actorUserId });
  if (error) {
    const missing = /undo_guest_merge|schema cache|does not exist/i.test(error.message) && !/already|not found|exists again/i.test(error.message);
    return { ok: false, error: missing ? "Undo isn't set up yet. The database update for it still needs to be run." : error.message };
  }
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: "guest_merge_undone",
    entityType: "guest_merge",
    entityId: params.mergeId,
    after: { restored: data ?? {} },
  });
  return { ok: true, restored: (data ?? {}) as Record<string, number> };
}

export async function dismissDuplicate(
  service: SupabaseClient,
  params: { tenantId: string; a: string; b: string; actorUserId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [guest_a, guest_b] = params.a < params.b ? [params.a, params.b] : [params.b, params.a];
  const { error } = await service
    .schema("hotel")
    .from("guest_duplicate_dismissals")
    .upsert({ tenant_id: params.tenantId, guest_a, guest_b, dismissed_by: params.actorUserId }, { onConflict: "tenant_id,guest_a,guest_b" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
