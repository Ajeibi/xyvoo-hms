import type { SupabaseClient } from "@supabase/supabase-js";
import { buildRateFeed } from "@/lib/hms/rates/feed";
import {
  addDaysIso,
  backoffSeconds,
  changedCells,
  channelAvailability,
  chunkPlanned,
  mergeDirty,
  planUpdates,
  availFingerprint,
  availRef,
  rateFingerprint,
  rateRef,
  sentKey,
  type AvailCell,
  type DirtyRow,
  type RateCell,
  type SentKey,
  type StateRange,
} from "./ari";
import { CHANNEL_CALLS_PER_MINUTE, CHANNEL_HORIZON_DAYS, type AriUpdate, type ChannelConnectionRef, type ChannelProvider } from "./types";

/*
 * Sending availability, rates and restrictions out. The database notes which nights changed (the
 * triggers in migration 20261207100000), `queueSync` turns those nights into the smallest set of
 * updates, and `drainOutbox` sends them at no more than 20 calls a minute, retrying with backoff.
 * Prices and rooms-left come from the same functions the website and the front desk use
 * (buildRateFeed: priceStay and the room type night counts), so a channel never sees a number the
 * hotel itself would not quote.
 */

export type ChannelTenant = { id: string; room_types: unknown; pricing_setup: unknown };
export type ChannelConnection = {
  id: string;
  tenant_id: string;
  provider: string;
  external_property_id: string;
  status: "active" | "paused";
  last_tested_at: string | null;
  last_poll_at: string | null;
  last_full_sync_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};
export type RoomMap = { room_type_code: string; external_room_type_id: string; max_rooms_for_channels: number | null };
export type RateMap = { room_type_code: string; plan_code: string; external_rate_plan_id: string };

export const lagosToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
export const refOf = (c: ChannelConnection): ChannelConnectionRef => ({ tenantId: c.tenant_id, externalPropertyId: c.external_property_id });

/** Reads every row of a query, past the database's 1000-row page. */
async function readAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadConnection(db: SupabaseClient, tenantId: string): Promise<ChannelConnection | null> {
  const { data } = await db.schema("hotel").from("channel_connections").select("*").eq("tenant_id", tenantId).maybeSingle();
  return (data as ChannelConnection | null) ?? null;
}

export async function loadMaps(db: SupabaseClient, tenantId: string) {
  const [rooms, rates] = await Promise.all([
    db.schema("hotel").from("channel_room_maps").select("room_type_code,external_room_type_id,max_rooms_for_channels").eq("tenant_id", tenantId),
    db.schema("hotel").from("channel_rate_maps").select("room_type_code,plan_code,external_rate_plan_id").eq("tenant_id", tenantId),
  ]);
  return { rooms: (rooms.data ?? []) as RoomMap[], rates: (rates.data ?? []) as RateMap[] };
}

async function setError(db: SupabaseClient, tenantId: string, message: string | null) {
  await db
    .schema("hotel")
    .from("channel_connections")
    .update(message ? { last_error: message, last_error_at: new Date().toISOString() } : { last_error: null })
    .eq("tenant_id", tenantId);
}

/** Plan codes the hotel allows on booking sites ("partner" channel). No plans set up means the default plan, which is sold everywhere. */
async function partnerPlanCodes(db: SupabaseClient, tenantId: string): Promise<Set<string> | "all"> {
  const { data } = await db.schema("hotel").from("rate_plans").select("code,channels,active").eq("tenant_id", tenantId);
  if (!data || data.length === 0) return "all";
  return new Set(data.filter((p) => p.active && (!Array.isArray(p.channels) || p.channels.length === 0 || (p.channels as string[]).includes("partner"))).map((p) => p.code as string));
}

export type QueueResult = { ok: true; calls: number; values: number; nights: number } | { ok: false; error: string };

/**
 * Works out what the channel has not been told yet and queues it. `full` sends every night for the
 * next 500 days (the first sync, or "send everything again"); otherwise only nights the database
 * noted as changed, and only the values that differ from what was last sent.
 */
export async function queueSync(db: SupabaseClient, tenant: ChannelTenant, opts: { full?: boolean; reason?: string } = {}): Promise<QueueResult> {
  const conn = await loadConnection(db, tenant.id);
  if (!conn) return { ok: false, error: "This hotel isn't connected to a channel manager yet." };
  if (conn.status !== "active") return { ok: true, calls: 0, values: 0, nights: 0 };
  const maps = await loadMaps(db, tenant.id);
  if (maps.rooms.length === 0) return { ok: false, error: "Match at least one room type to a channel room first." };

  const today = lagosToday();
  const allTypes = maps.rooms.map((m) => m.room_type_code);
  let work: { roomTypeCode: string; from: string; to: string }[];
  let dirtyIds: number[] = [];
  if (opts.full) {
    work = allTypes.map((t) => ({ roomTypeCode: t, from: today, to: addDaysIso(today, CHANNEL_HORIZON_DAYS - 1) }));
  } else {
    const dirty = await readAll<DirtyRow & { id: number }>((from, to) =>
      db.schema("hotel").from("channel_dirty").select("id,room_type_code,date_from,date_to").eq("tenant_id", tenant.id).order("id").range(from, to),
    );
    if (dirty.length === 0) return { ok: true, calls: 0, values: 0, nights: 0 };
    dirtyIds = dirty.map((d) => d.id);
    work = mergeDirty(dirty, allTypes, today, CHANNEL_HORIZON_DAYS);
  }

  const allowed = await partnerPlanCodes(db, tenant.id);
  const capOf = new Map(maps.rooms.map((m) => [m.room_type_code, m.max_rooms_for_channels]));
  const planFor = new Map(maps.rates.map((m) => [`${m.room_type_code}|${m.plan_code}`, m.external_rate_plan_id]));
  const roomFor = new Map(maps.rooms.map((m) => [m.room_type_code, m.external_room_type_id]));

  const avail: AvailCell[] = [];
  const rates: RateCell[] = [];
  try {
    for (const w of work) {
      for (let from = w.from; from <= w.to; from = addDaysIso(from, 120)) {
        const chunkEnd = addDaysIso(from, 119) < w.to ? addDaysIso(from, 119) : w.to;
        const days = Math.round((new Date(`${chunkEnd}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86_400_000) + 1;
        const feed = await buildRateFeed(db, tenant, { fromDay: from, days, roomTypeCode: w.roomTypeCode });
        const seenAvail = new Set<string>();
        for (const n of feed.nights) {
          if (n.date > chunkEnd) continue;
          if (!seenAvail.has(n.date)) {
            seenAvail.add(n.date);
            avail.push({ roomTypeCode: w.roomTypeCode, date: n.date, availability: channelAvailability(feed.free[w.roomTypeCode]?.[n.date] ?? 0, capOf.get(w.roomTypeCode)) });
          }
          if (!planFor.has(`${n.roomTypeCode}|${n.planCode}`)) continue;
          const sellable = allowed === "all" || allowed.has(n.planCode);
          rates.push({
            roomTypeCode: n.roomTypeCode,
            planCode: n.planCode,
            date: n.date,
            rate: n.price,
            // A plan the hotel keeps off booking sites is closed there rather than left showing an old price.
            stopSell: n.closed || !sellable,
            closedToArrival: n.closedToArrival,
            closedToDeparture: n.closedToDeparture,
            minStay: n.minStay,
            maxStay: n.maxStay,
          });
        }
      }
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "The rates couldn't be worked out." };
  }

  // What the channel already has, for the nights we are about to compare.
  const sent = new Map<SentKey, string>();
  if (!opts.full && (avail.length || rates.length)) {
    const minDay = [...avail, ...rates].reduce((m, c) => (c.date < m ? c.date : m), "9999-12-31");
    const maxDay = [...avail, ...rates].reduce((m, c) => (c.date > m ? c.date : m), "0000-01-01");
    const rows = await readAll<{ kind: "availability" | "rate"; ref: string; day: string; fingerprint: string }>((from, to) =>
      db.schema("hotel").from("channel_sent_state").select("kind,ref,day,fingerprint").eq("tenant_id", tenant.id).gte("day", minDay).lte("day", maxDay).order("day").range(from, to),
    );
    for (const r of rows) sent.set(sentKey(r.kind, r.ref, r.day), r.fingerprint);
  }

  const availChanged = changedCells(avail, "availability", availRef, availFingerprint, sent, Boolean(opts.full));
  const ratesChanged = changedCells(rates, "rate", rateRef, rateFingerprint, sent, Boolean(opts.full));
  const planned = planUpdates(availChanged, ratesChanged, { roomType: (t) => roomFor.get(t), ratePlan: (t, p) => planFor.get(`${t}|${p}`) });
  // One database row is one call to the provider. A full sync is two big calls (availability, then rates), as the provider asks.
  const availPart = { updates: planned.updates.filter((u) => u.kind === "availability"), state: planned.state.filter((s) => s.kind === "availability") };
  const ratePart = { updates: planned.updates.filter((u) => u.kind === "rate"), state: planned.state.filter((s) => s.kind === "rate") };
  const calls = [...chunkPlanned(availPart, 1000), ...chunkPlanned(ratePart, 1000)];

  if (calls.length) {
    const { error } = await db
      .schema("hotel")
      .from("channel_outbox")
      .insert(calls.map((c) => ({ tenant_id: tenant.id, payload: c.updates, state_rows: c.state, reason: opts.reason ?? (opts.full ? "full sync" : "changes") })));
    if (error) return { ok: false, error: error.message };
  }
  // Only now forget the nights we have queued; a crash above leaves them to be found again.
  if (dirtyIds.length) {
    for (let i = 0; i < dirtyIds.length; i += 500) await db.schema("hotel").from("channel_dirty").delete().in("id", dirtyIds.slice(i, i + 500));
  }
  if (opts.full) await db.schema("hotel").from("channel_connections").update({ last_full_sync_at: new Date().toISOString() }).eq("tenant_id", tenant.id);
  const nights = new Set([...availChanged.map((c) => c.date), ...ratesChanged.map((c) => c.date)]).size;
  return { ok: true, calls: calls.length, values: planned.updates.length, nights };
}

async function recordSent(db: SupabaseClient, tenantId: string, state: StateRange[]) {
  const rows: { tenant_id: string; kind: string; ref: string; day: string; fingerprint: string; sent_at: string }[] = [];
  const now = new Date().toISOString();
  for (const s of state) {
    for (let d = s.from; d <= s.to; d = addDaysIso(d, 1)) rows.push({ tenant_id: tenantId, kind: s.kind, ref: s.ref, day: d, fingerprint: s.fingerprint, sent_at: now });
  }
  for (let i = 0; i < rows.length; i += 1000) {
    await db.schema("hotel").from("channel_sent_state").upsert(rows.slice(i, i + 1000), { onConflict: "tenant_id,kind,ref,day" });
  }
}

export type DrainResult = { sent: number; failed: number; waiting: number; limited: boolean };

/** Sends queued calls, no more than the provider's per-minute limit, oldest first. */
export async function drainOutbox(db: SupabaseClient, provider: ChannelProvider, conn: ChannelConnection, opts: { maxCalls?: number } = {}): Promise<DrainResult> {
  const result: DrainResult = { sent: 0, failed: 0, waiting: 0, limited: false };
  if (conn.status !== "active") return result;
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  const { count: recent } = await db.schema("hotel").from("channel_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", conn.tenant_id).eq("status", "sent").gte("sent_at", minuteAgo);
  let budget = Math.min(opts.maxCalls ?? CHANNEL_CALLS_PER_MINUTE, CHANNEL_CALLS_PER_MINUTE - (recent ?? 0));

  const { data: due } = await db
    .schema("hotel")
    .from("channel_outbox")
    .select("id,payload,state_rows,attempts")
    .eq("tenant_id", conn.tenant_id)
    .eq("status", "pending")
    .lte("next_attempt_at", new Date().toISOString())
    .order("id")
    .limit(Math.max(budget, 0) + 1);
  for (const row of due ?? []) {
    if (budget <= 0) {
      result.limited = true;
      break;
    }
    budget -= 1;
    const pushed = await provider.pushAri(refOf(conn), row.payload as AriUpdate[]);
    if (pushed.ok) {
      await recordSent(db, conn.tenant_id, row.state_rows as StateRange[]);
      await db.schema("hotel").from("channel_outbox").update({ status: "sent", sent_at: new Date().toISOString(), task_ids: pushed.taskIds, last_error: null, attempts: (row.attempts as number) + 1 }).eq("id", row.id);
      result.sent += 1;
      continue;
    }
    const attempts = (row.attempts as number) + 1;
    const giveUp = !pushed.retryable || attempts >= 8;
    await db
      .schema("hotel")
      .from("channel_outbox")
      .update({
        status: giveUp ? "failed" : "pending",
        attempts,
        last_error: pushed.error,
        next_attempt_at: new Date(Date.now() + (pushed.retryAfterSeconds ?? backoffSeconds(attempts)) * 1000).toISOString(),
      })
      .eq("id", row.id);
    await setError(db, conn.tenant_id, pushed.error);
    if (giveUp) result.failed += 1;
    // A rate-limit or outage answer means the next calls would meet the same wall.
    if (pushed.retryable) break;
  }
  const { count: waiting } = await db.schema("hotel").from("channel_outbox").select("id", { count: "exact", head: true }).eq("tenant_id", conn.tenant_id).eq("status", "pending");
  result.waiting = waiting ?? 0;
  if (result.sent > 0 && result.failed === 0) await setError(db, conn.tenant_id, null);
  return result;
}

/** Puts failed calls back in the queue. */
export async function retryFailed(db: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await db.schema("hotel").from("channel_outbox").update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("status", "failed").select("id");
  return data?.length ?? 0;
}

/** Forces the next sync to resend these nights (used when a channel booking could not be placed). */
export async function markNightsDirty(db: SupabaseClient, tenantId: string, roomTypeCode: string | null, from: string, to: string) {
  await db.schema("hotel").from("channel_dirty").insert({ tenant_id: tenantId, room_type_code: roomTypeCode, date_from: from, date_to: to });
}

/** Queue then send, in one go. */
export async function syncNow(db: SupabaseClient, provider: ChannelProvider, tenant: ChannelTenant, opts: { full?: boolean; reason?: string } = {}) {
  const queued = await queueSync(db, tenant, opts);
  const conn = await loadConnection(db, tenant.id);
  const drained = conn ? await drainOutbox(db, provider, conn) : null;
  return { queued, drained };
}
