import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAll } from "@/lib/hms/reports/load";
import type { GroupAccessContext } from "./group-access";

/*
 * Loyalty across the group. Each hotel keeps its own ledger and liability. With "share loyalty" on,
 * a guest's balance is the total of their linked guests' ledgers at every hotel, and points earned at
 * one hotel can be spent at another. The settlement below works out what each hotel owes the others
 * for points it accepted that were earned elsewhere.
 */

export type LedgerEntry = { profileId: string; tenantId: string; points: number; kind: "earn" | "redeem" | "adjust" };

export type SettlementLine = { fromTenantId: string; toTenantId: string; points: number };

export type HotelLoyaltyTotals = { tenantId: string; earned: number; redeemed: number; adjusted: number; balance: number };

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * For each linked guest: at every hotel where they redeemed more than they earned, the extra points
 * came from hotels where they earned more than they redeemed, shared in proportion to that surplus.
 * The redeeming hotel owes those hotels (it gave the guest value the others' liability was holding).
 */
export function loyaltySettlement(entries: LedgerEntry[]): { totals: HotelLoyaltyTotals[]; owes: SettlementLine[] } {
  const totals = new Map<string, HotelLoyaltyTotals>();
  const perProfile = new Map<string, Map<string, { earned: number; redeemed: number }>>();
  for (const e of entries) {
    const t = totals.get(e.tenantId) ?? { tenantId: e.tenantId, earned: 0, redeemed: 0, adjusted: 0, balance: 0 };
    if (e.kind === "earn") t.earned += e.points;
    else if (e.kind === "redeem") t.redeemed += Math.abs(e.points);
    else t.adjusted += e.points;
    t.balance += e.points;
    totals.set(e.tenantId, t);

    const p = perProfile.get(e.profileId) ?? new Map();
    const h = p.get(e.tenantId) ?? { earned: 0, redeemed: 0 };
    if (e.points > 0) h.earned += e.points;
    else h.redeemed += Math.abs(e.points);
    p.set(e.tenantId, h);
    perProfile.set(e.profileId, p);
  }

  const owed = new Map<string, number>();
  for (const hotels of perProfile.values()) {
    const surplus = [...hotels.entries()].map(([id, h]) => ({ id, s: h.earned - h.redeemed })).filter((x) => x.s > 0);
    const deficit = [...hotels.entries()].map(([id, h]) => ({ id, d: h.redeemed - h.earned })).filter((x) => x.d > 0);
    const surplusTotal = surplus.reduce((s, x) => s + x.s, 0);
    if (!surplusTotal) continue;
    for (const d of deficit) {
      const covered = Math.min(d.d, surplusTotal);
      for (const s of surplus) {
        const key = `${d.id}|${s.id}`;
        owed.set(key, (owed.get(key) ?? 0) + (covered * s.s) / surplusTotal);
      }
    }
  }
  const owes = [...owed.entries()]
    .map(([key, points]) => {
      const [fromTenantId, toTenantId] = key.split("|");
      return { fromTenantId, toTenantId, points: round(points) };
    })
    .filter((l) => l.points > 0);
  return { totals: [...totals.values()], owes };
}

export type GroupLoyaltyView = {
  totals: Array<HotelLoyaltyTotals & { hotelName: string; pointValue: number; currency: string }>;
  owes: Array<SettlementLine & { fromName: string; toName: string; value: number }>;
  linkedGuests: number;
};

/** The group's loyalty page, read with the caller's token (only hotels the database allows count). */
export async function loadGroupLoyalty(ctx: GroupAccessContext): Promise<GroupLoyaltyView> {
  const db = ctx.userDb.schema("hotel");
  const links = await fetchAll<{ profile_id: string; tenant_id: string; guest_id: string }>((a, b) =>
    db.from("hotel_group_guest_links").select("profile_id, tenant_id, guest_id").eq("group_id", ctx.group.id).order("id").range(a, b),
  );
  const profileOf = new Map(links.map((l) => [`${l.tenant_id}|${l.guest_id}`, l.profile_id]));
  const entries: LedgerEntry[] = [];
  for (const h of ctx.hotels) {
    const guestIds = links.filter((l) => l.tenant_id === h.tenantId).map((l) => l.guest_id);
    for (let i = 0; i < guestIds.length; i += 200) {
      const part = guestIds.slice(i, i + 200);
      const rows = await fetchAll<{ guest_id: string; points: number; kind: string }>((a, b) =>
        db.from("guest_loyalty_ledger").select("guest_id, points, kind").eq("tenant_id", h.tenantId).in("guest_id", part).order("id").range(a, b),
      );
      for (const r of rows) {
        const profileId = profileOf.get(`${h.tenantId}|${r.guest_id}`);
        if (profileId) entries.push({ profileId, tenantId: h.tenantId, points: Number(r.points) || 0, kind: (r.kind as LedgerEntry["kind"]) ?? "adjust" });
      }
    }
  }
  const { data: settings } = await db.from("loyalty_settings").select("tenant_id, point_value").in("tenant_id", ctx.hotels.map((h) => h.tenantId));
  const pointValue = new Map((settings ?? []).map((s) => [s.tenant_id as string, Number(s.point_value) || 0]));
  const names = new Map(ctx.hotels.map((h) => [h.tenantId, h]));
  const { totals, owes } = loyaltySettlement(entries);
  return {
    linkedGuests: new Set(links.map((l) => l.profile_id)).size,
    totals: ctx.hotels.map((h) => {
      const t = totals.find((x) => x.tenantId === h.tenantId) ?? { tenantId: h.tenantId, earned: 0, redeemed: 0, adjusted: 0, balance: 0 };
      return { ...t, hotelName: h.name, pointValue: pointValue.get(h.tenantId) ?? 0, currency: h.currency };
    }),
    owes: owes.map((o) => ({
      ...o,
      fromName: names.get(o.fromTenantId)?.name ?? "Hotel",
      toName: names.get(o.toTenantId)?.name ?? "Hotel",
      // Valued at the earning hotel's point value: that is the liability being used up.
      value: round(o.points * (pointValue.get(o.toTenantId) ?? 0)),
    })),
  };
}

/** One guest's points across the group, as their hotel sees them (database decides which hotels count). */
export async function groupPointsFor(userDb: SupabaseClient, tenantId: string, guestId: string): Promise<{ total: number; byHotel: Array<{ tenantId: string; points: number }> }> {
  const { data, error } = await userDb.schema("hotel").rpc("group_loyalty_balance", { p_tenant: tenantId, p_guest: guestId });
  if (error) return { total: 0, byHotel: [] };
  const byHotel = ((data ?? []) as Array<{ tenant_id: string; points: number }>).map((r) => ({ tenantId: r.tenant_id, points: Number(r.points) || 0 }));
  return { total: byHotel.reduce((s, r) => s + r.points, 0), byHotel };
}
