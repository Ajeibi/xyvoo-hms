import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { loadBilled } from "@/lib/hms/guest-metrics";
import {
  DEFAULT_LOYALTY,
  cleanTiers,
  pointsForSpend,
  tierFor,
  totalsOf,
  type GuestLoyalty,
  type LoyaltyLedgerEntry,
  type LoyaltySettings,
  type LoyaltyTier,
} from "@/lib/hms/guest-loyalty-shared";

/*
 * Loyalty. Points are a ledger that is only added to: a stay earns once (the database refuses a
 * second earn for the same stay), redeeming and adjusting add new rows, and nothing is edited.
 * Earning reads the bill (guest-metrics), so a stay earns on what the guest was really billed.
 * Checking out credits that stay's points straight away; syncLoyaltyEarnings also credits any
 * finished stay that has not been credited yet. It runs each night, when someone opens the
 * Loyalty screen, and from the button there.
 */

export async function getLoyaltySettings(service: SupabaseClient, tenantId: string): Promise<LoyaltySettings> {
  const { data, error } = await service.schema("hotel").from("loyalty_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  if (error || !data) return { ...DEFAULT_LOYALTY, tiers: DEFAULT_LOYALTY.tiers.map((t) => ({ ...t })) };
  const raw = Array.isArray(data.tiers) ? (data.tiers as { name?: string; min_points?: number; perks?: string }[]) : [];
  const tiers: LoyaltyTier[] = cleanTiers(raw.map((t) => ({ name: t.name ?? "", minPoints: Number(t.min_points) || 0, perks: t.perks ?? "" })));
  return {
    enabled: Boolean(data.enabled),
    spendPerPoint: Number(data.spend_per_point) || DEFAULT_LOYALTY.spendPerPoint,
    pointValue: Number(data.point_value) || 0,
    earnFrom: (data.earn_from as string | null) ?? null,
    tiers: tiers.length > 0 ? tiers : DEFAULT_LOYALTY.tiers,
  };
}

export async function saveLoyaltySettings(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; settings: LoyaltySettings },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const s = params.settings;
  const tiers = cleanTiers(s.tiers);
  if (tiers.length === 0) return { ok: false, error: "Add at least one tier." };
  if (new Set(tiers.map((t) => t.name.toLowerCase())).size !== tiers.length) return { ok: false, error: "Each tier needs its own name." };
  if (tiers[0].minPoints !== 0) return { ok: false, error: "The lowest tier must start at 0 points, so every member has a tier." };
  if (!(s.spendPerPoint > 0)) return { ok: false, error: "Spend per point must be more than zero." };

  const { error } = await service.schema("hotel").from("loyalty_settings").upsert(
    {
      tenant_id: params.tenantId,
      enabled: s.enabled,
      spend_per_point: s.spendPerPoint,
      point_value: Math.max(0, s.pointValue),
      earn_from: s.earnFrom || null,
      tiers: tiers.map((t) => ({ name: t.name, min_points: t.minPoints, perks: t.perks })),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) return { ok: false, error: error.message };
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.actorUserId, action: "loyalty_settings_saved", entityType: "loyalty", after: { enabled: s.enabled } });
  return { ok: true };
}

/** A guest's balance, tier and recent movements. */
export async function getGuestLoyalty(service: SupabaseClient, tenantId: string, guestId: string, settings: LoyaltySettings): Promise<GuestLoyalty> {
  const { data: rows } = await service
    .schema("hotel")
    .from("guest_loyalty_ledger")
    .select("id,points,kind,reservation_id,note,created_by,created_at")
    .eq("tenant_id", tenantId)
    .eq("guest_id", guestId)
    .order("created_at", { ascending: false })
    .limit(500);
  const list = rows ?? [];

  const resIds = [...new Set(list.map((r) => r.reservation_id as string | null).filter((x): x is string => Boolean(x)))];
  const codes = new Map<string, string>();
  if (resIds.length > 0) {
    const { data: res } = await service.schema("hotel").from("reservations").select("id,confirmation_code").eq("tenant_id", tenantId).in("id", resIds);
    for (const r of res ?? []) codes.set(r.id as string, r.confirmation_code as string);
  }
  const authorIds = [...new Set(list.map((r) => r.created_by as string | null).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (authorIds.length > 0) {
    const { data: profiles } = await service.schema("hotel").from("profiles").select("user_id,contact_name").eq("tenant_id", tenantId).in("user_id", authorIds);
    for (const p of profiles ?? []) if (p.contact_name) names.set(p.user_id as string, p.contact_name as string);
  }

  const { balance, lifetime } = totalsOf(list.map((r) => Number(r.points) || 0));
  const { tier, nextTier, pointsToNextTier } = tierFor(lifetime, settings.tiers);
  const ledger: LoyaltyLedgerEntry[] = list.slice(0, 50).map((r) => ({
    id: r.id as string,
    points: Number(r.points) || 0,
    kind: r.kind as LoyaltyLedgerEntry["kind"],
    note: (r.note as string | null) ?? null,
    confirmationCode: r.reservation_id ? (codes.get(r.reservation_id as string) ?? null) : null,
    createdByName: r.created_by ? (names.get(r.created_by as string) ?? "Staff") : null,
    createdAt: r.created_at as string,
  }));
  return { balance, lifetime, tier, nextTier, pointsToNextTier, ledger };
}

/** Balance and lifetime for many guests at once (the leaderboard and the directory). */
export async function getLoyaltyTotals(service: SupabaseClient, tenantId: string, guestIds?: string[]): Promise<Map<string, { balance: number; lifetime: number }>> {
  const out = new Map<string, { balance: number; lifetime: number }>();
  const grouped = new Map<string, number[]>();
  const PAGE = 1000;
  const read = async (ids: string[] | null) => {
    for (let from = 0; ; from += PAGE) {
      let q = service.schema("hotel").from("guest_loyalty_ledger").select("guest_id,points").eq("tenant_id", tenantId).order("id").range(from, from + PAGE - 1);
      if (ids) q = q.in("guest_id", ids);
      const { data } = await q;
      for (const r of data ?? []) {
        const list = grouped.get(r.guest_id as string) ?? [];
        list.push(Number(r.points) || 0);
        grouped.set(r.guest_id as string, list);
      }
      if ((data ?? []).length < PAGE) break;
    }
  };
  if (guestIds) {
    for (let i = 0; i < guestIds.length; i += 150) await read(guestIds.slice(i, i + 150));
  } else {
    await read(null);
  }
  for (const [id, pts] of grouped) out.set(id, totalsOf(pts));
  return out;
}

/** Spend points against a bill, or correct a balance by hand. A redeem can't take the balance below zero. */
export async function addLoyaltyPoints(
  service: SupabaseClient,
  params: { tenantId: string; guestId: string; actorUserId: string; kind: "redeem" | "adjust"; points: number; note: string; reservationId?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const points = Math.trunc(params.points);
  if (!points) return { ok: false, error: "Enter a number of points." };
  if (!params.note.trim()) return { ok: false, error: "Say why, so the record makes sense later." };
  const settings = await getLoyaltySettings(service, params.tenantId);
  if (!settings.enabled) return { ok: false, error: "Loyalty isn't switched on yet." };

  const { data: guest } = await service.schema("hotel").from("guests").select("id,anonymised_at").eq("tenant_id", params.tenantId).eq("id", params.guestId).maybeSingle();
  if (!guest) return { ok: false, error: "Guest not found." };
  if (guest.anonymised_at) return { ok: false, error: "This guest's details were erased." };

  const signed = params.kind === "redeem" ? -Math.abs(points) : points;
  const current = await getGuestLoyalty(service, params.tenantId, params.guestId, settings);
  if (current.balance + signed < 0) return { ok: false, error: `They only have ${current.balance} points.` };

  const { error } = await service.schema("hotel").from("guest_loyalty_ledger").insert({
    tenant_id: params.tenantId,
    guest_id: params.guestId,
    points: signed,
    kind: params.kind,
    note: params.note.trim(),
    reservation_id: params.reservationId ?? null,
    created_by: params.actorUserId,
  });
  if (error) return { ok: false, error: error.message };
  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.actorUserId,
    action: params.kind === "redeem" ? "loyalty_points_redeemed" : "loyalty_points_adjusted",
    entityType: "guest",
    entityId: params.guestId,
    after: { points: signed },
  });
  return { ok: true };
}

/**
 * Credits points for every finished stay that has not earned yet, to the guest who paid (the booking's
 * primary guest). Safe to run any time and as often as you like.
 */
export async function syncLoyaltyEarnings(
  service: SupabaseClient,
  tenantId: string,
  settings?: LoyaltySettings,
  /** Credit just this stay, which is what checking out does. */
  onlyReservationId?: string,
): Promise<{ credited: number; points: number }> {
  const s = settings ?? (await getLoyaltySettings(service, tenantId));
  if (!s.enabled) return { credited: 0, points: 0 };

  const done = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await service
      .schema("hotel")
      .from("guest_loyalty_ledger")
      .select("reservation_id")
      .eq("tenant_id", tenantId)
      .eq("kind", "earn")
      .not("reservation_id", "is", null)
      .order("id")
      .range(from, from + 999);
    for (const r of data ?? []) done.add(r.reservation_id as string);
    if ((data ?? []).length < 1000) break;
  }

  type Row = { id: string; total_room_charges: number | string | null; checked_out_at: string | null; departure_at: string; reservation_guests: { guest_id: string; is_primary: boolean }[] | null };
  const todo: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = service
      .schema("hotel")
      .from("reservations")
      .select("id,total_room_charges,checked_out_at,departure_at,reservation_guests(guest_id,is_primary)")
      .eq("tenant_id", tenantId)
      .eq("status", "checked_out")
      .order("id")
      .range(from, from + 999);
    if (s.earnFrom) q = q.gte("departure_at", `${s.earnFrom}T00:00:00`);
    if (onlyReservationId) q = q.eq("id", onlyReservationId);
    const { data } = await q;
    for (const r of (data ?? []) as unknown as Row[]) if (!done.has(r.id)) todo.push(r);
    if ((data ?? []).length < 1000) break;
  }
  if (todo.length === 0) return { credited: 0, points: 0 };

  const billed = await loadBilled(service, tenantId, todo.map((r) => r.id));
  const rows: Record<string, unknown>[] = [];
  let total = 0;
  for (const r of todo) {
    const payer = (r.reservation_guests ?? []).find((g) => g.is_primary) ?? (r.reservation_guests ?? [])[0];
    if (!payer) continue;
    const spend = billed.get(r.id)?.total ?? (Number(r.total_room_charges) || 0);
    const pts = pointsForSpend(spend, s.spendPerPoint);
    if (pts <= 0) continue;
    rows.push({ tenant_id: tenantId, guest_id: payer.guest_id, points: pts, kind: "earn", reservation_id: r.id, note: "Points for a completed stay" });
    total += pts;
  }
  let credited = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    const { error } = await service.schema("hotel").from("guest_loyalty_ledger").insert(batch);
    if (!error) {
      credited += batch.length;
    } else {
      // A concurrent run may have credited one of these; fall back to one at a time and skip repeats.
      for (const row of batch) {
        const { error: one } = await service.schema("hotel").from("guest_loyalty_ledger").insert(row);
        if (!one) credited += 1;
      }
    }
  }
  return { credited, points: total };
}

export type LoyaltyOverview = {
  members: number;
  outstandingPoints: number;
  tierCounts: { name: string; count: number }[];
  top: { guestId: string; name: string; balance: number; lifetime: number; tier: string | null }[];
};

/** How the programme is doing: members per tier, points owed, and the guests with the most points. */
export async function getLoyaltyOverview(service: SupabaseClient, tenantId: string, settings: LoyaltySettings): Promise<LoyaltyOverview> {
  const totals = await getLoyaltyTotals(service, tenantId);
  const entries = [...totals.entries()];
  const tierCounts = new Map<string, number>(settings.tiers.map((t) => [t.name, 0]));
  let outstanding = 0;
  for (const [, t] of entries) {
    outstanding += Math.max(0, t.balance);
    const name = tierFor(t.lifetime, settings.tiers).tier?.name;
    if (name) tierCounts.set(name, (tierCounts.get(name) ?? 0) + 1);
  }
  const topEntries = entries.sort((a, b) => b[1].lifetime - a[1].lifetime).slice(0, 20);
  const names = new Map<string, string>();
  if (topEntries.length > 0) {
    const { data } = await service
      .schema("hotel")
      .from("guests")
      .select("id,title,first_name,last_name")
      .eq("tenant_id", tenantId)
      .in("id", topEntries.map(([id]) => id));
    for (const g of data ?? []) names.set(g.id as string, `${g.first_name} ${g.last_name}`.trim());
  }
  return {
    members: entries.length,
    outstandingPoints: outstanding,
    tierCounts: [...tierCounts].map(([name, count]) => ({ name, count })),
    top: topEntries.map(([id, t]) => ({
      guestId: id,
      name: names.get(id) ?? "Guest",
      balance: t.balance,
      lifetime: t.lifetime,
      tier: tierFor(t.lifetime, settings.tiers).tier?.name ?? null,
    })),
  };
}
