import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/hms/channels/adapters";
import { markInboxDone, retryInbox } from "@/lib/hms/channels/inbound";
import { loadChannelTenant, runChannelCycle } from "@/lib/hms/channels/service";
import { drainOutbox, loadConnection, queueSync, refOf, retryFailed } from "@/lib/hms/channels/sync";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";

export const maxDuration = 120;

const base = z.object({ slug: z.string().min(1) });
const body = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("connect"), propertyId: z.string().trim().min(8).max(80) }),
  base.extend({ action: z.literal("test") }),
  base.extend({ action: z.literal("targets") }),
  base.extend({
    action: z.literal("save_maps"),
    rooms: z.array(z.object({ roomTypeCode: z.string().min(1), externalRoomTypeId: z.string().min(1), maxRoomsForChannels: z.number().int().min(0).nullable() })).max(100),
    rates: z.array(z.object({ roomTypeCode: z.string().min(1), planCode: z.string().min(1), externalRatePlanId: z.string().min(1) })).max(500),
  }),
  base.extend({ action: z.literal("sync"), full: z.boolean().optional() }),
  base.extend({ action: z.literal("check") }),
  base.extend({ action: z.literal("retry_failed") }),
  base.extend({ action: z.literal("retry_message"), id: z.string().uuid() }),
  base.extend({ action: z.literal("message_done"), id: z.string().uuid() }),
  base.extend({ action: z.literal("pause"), paused: z.boolean() }),
  base.extend({ action: z.literal("disconnect") }),
]);

/** POST /api/hotel/channels: every staff action on the Channels screen. */
export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Please check what you entered." }, { status: 422 });
  const input = parsed.data;

  const auth = await requireHotelApiSection(input.slug, ["reservations"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { tenant, service: db, user } = auth;
  const provider = getProvider();
  const log = (action: string, after?: Record<string, unknown>) => writeAuditLog({ tenantId: tenant.id, actorUserId: user.id, action: `channel_${action}`, entityType: "channel", after: after ?? null });

  if (input.action === "connect") {
    if (!provider.isConfigured()) return NextResponse.json({ error: "The channel manager key isn't set on the server yet (see CHANNEX_API_KEY)." }, { status: 409 });
    const ref = { tenantId: tenant.id, externalPropertyId: input.propertyId };
    const test = await provider.testConnection(ref);
    if (!test.ok) return NextResponse.json({ error: test.error }, { status: 422 });
    const { error } = await db
      .schema("hotel")
      .from("channel_connections")
      .upsert({ tenant_id: tenant.id, provider: provider.id, external_property_id: input.propertyId, status: "active", last_tested_at: new Date().toISOString(), last_error: null, created_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
    if (error) return NextResponse.json({ error: "The connection couldn't be saved." }, { status: 500 });
    await log("connected", { property: test.name });
    return NextResponse.json({ ok: true, name: test.name });
  }

  const conn = await loadConnection(db, tenant.id);
  if (!conn) return NextResponse.json({ error: "Connect to the channel manager first." }, { status: 409 });

  switch (input.action) {
    case "test": {
      const r = await provider.testConnection(refOf(conn));
      await db.schema("hotel").from("channel_connections").update({ last_tested_at: new Date().toISOString(), ...(r.ok ? { last_error: null } : { last_error: r.error, last_error_at: new Date().toISOString() }) }).eq("id", conn.id);
      return r.ok ? NextResponse.json({ ok: true, name: r.name }) : NextResponse.json({ error: r.error }, { status: 422 });
    }
    case "targets": {
      const r = await provider.listMappingTargets(refOf(conn));
      return r.ok ? NextResponse.json({ ok: true, targets: r.targets }) : NextResponse.json({ error: r.error }, { status: 422 });
    }
    case "save_maps": {
      const rooms = input.rooms;
      const ext = new Set<string>();
      for (const r of rooms) {
        if (ext.has(r.externalRoomTypeId)) return NextResponse.json({ error: "Two of your room types are matched to the same channel room." }, { status: 422 });
        ext.add(r.externalRoomTypeId);
      }
      const extRates = new Set<string>();
      for (const r of input.rates) {
        if (extRates.has(r.externalRatePlanId)) return NextResponse.json({ error: "Two of your rates are matched to the same channel rate." }, { status: 422 });
        extRates.add(r.externalRatePlanId);
        if (!rooms.some((m) => m.roomTypeCode === r.roomTypeCode)) return NextResponse.json({ error: "A rate is matched for a room type that has no channel room." }, { status: 422 });
      }
      await db.schema("hotel").from("channel_room_maps").delete().eq("tenant_id", tenant.id);
      await db.schema("hotel").from("channel_rate_maps").delete().eq("tenant_id", tenant.id);
      if (rooms.length) {
        const { error } = await db.schema("hotel").from("channel_room_maps").insert(rooms.map((r) => ({ tenant_id: tenant.id, room_type_code: r.roomTypeCode, external_room_type_id: r.externalRoomTypeId, max_rooms_for_channels: r.maxRoomsForChannels })));
        if (error) return NextResponse.json({ error: "The room matching couldn't be saved." }, { status: 500 });
      }
      if (input.rates.length) {
        const { error } = await db.schema("hotel").from("channel_rate_maps").insert(input.rates.map((r) => ({ tenant_id: tenant.id, room_type_code: r.roomTypeCode, plan_code: r.planCode, external_rate_plan_id: r.externalRatePlanId })));
        if (error) return NextResponse.json({ error: "The rate matching couldn't be saved." }, { status: 500 });
      }
      await log("mapping_saved", { rooms: rooms.length, rates: input.rates.length });
      // New matching means the channel has never been told about these rooms: send everything.
      const t = await loadChannelTenant(db, tenant.id);
      if (t && rooms.length) await queueSync(db, t, { full: true, reason: "after matching" });
      return NextResponse.json({ ok: true });
    }
    case "sync": {
      const t = await loadChannelTenant(db, tenant.id);
      if (!t) return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
      const queued = await queueSync(db, t, { full: input.full, reason: input.full ? "full sync (staff)" : "send now (staff)" });
      if (!queued.ok) return NextResponse.json({ error: queued.error }, { status: 422 });
      const drained = await drainOutbox(db, provider, (await loadConnection(db, tenant.id)) ?? conn);
      await log(input.full ? "full_sync" : "sync", { calls: queued.calls, sent: drained.sent });
      return NextResponse.json({ ok: true, queued, drained });
    }
    case "check": {
      const r = await runChannelCycle(db, conn, provider);
      return NextResponse.json({ ok: !r.error, ...r }, { status: r.error ? 502 : 200 });
    }
    case "retry_failed": {
      const n = await retryFailed(db, tenant.id);
      const drained = await drainOutbox(db, provider, conn);
      return NextResponse.json({ ok: true, retried: n, drained });
    }
    case "retry_message": {
      const t = await loadChannelTenant(db, tenant.id);
      if (!t) return NextResponse.json({ error: "Hotel not found." }, { status: 404 });
      const r = await retryInbox(db, provider, conn, t, input.id);
      if (!r) return NextResponse.json({ error: "That message is already done." }, { status: 409 });
      await runChannelCycle(db, conn, provider);
      return NextResponse.json({ ok: r.status !== "needs_attention", status: r.status, message: r.message });
    }
    case "message_done": {
      await markInboxDone(db, tenant.id, input.id, user.id);
      return NextResponse.json({ ok: true });
    }
    case "pause": {
      await db.schema("hotel").from("channel_connections").update({ status: input.paused ? "paused" : "active", updated_at: new Date().toISOString() }).eq("id", conn.id);
      await log(input.paused ? "paused" : "resumed");
      return NextResponse.json({ ok: true });
    }
    case "disconnect": {
      await db.schema("hotel").from("channel_connections").delete().eq("id", conn.id);
      await db.schema("hotel").from("channel_sent_state").delete().eq("tenant_id", tenant.id);
      await db.schema("hotel").from("channel_outbox").delete().eq("tenant_id", tenant.id).eq("status", "pending");
      await db.schema("hotel").from("channel_dirty").delete().eq("tenant_id", tenant.id);
      await log("disconnected");
      return NextResponse.json({ ok: true });
    }
  }
}
