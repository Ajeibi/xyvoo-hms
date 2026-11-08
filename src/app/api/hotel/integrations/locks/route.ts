import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember, requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { loadConnection, recentIntegrationEvents, saveConnection } from "@/lib/hms/integrations/connections";
import { ttlockSignIn } from "@/lib/hms/integrations/locks/adapters/ttlock";
import {
  issueStayCode,
  listLockMaps,
  readStayCode,
  refreshLockBatteries,
  resolveLockProvider,
  revokeStayCodes,
  testLockConnection,
  unlockRoomLock,
  LOW_BATTERY_PERCENT,
} from "@/lib/hms/integrations/locks/service";
import { LOCK_PROVIDERS, type LockConnectionConfig } from "@/lib/hms/integrations/locks/types";
import type { HmsSectionKey } from "@/lib/hms/department-access";

const STAY_SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const Body = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("connect_ttlock"), username: z.string().trim().min(1).max(120), password: z.string().min(1).max(200), hasGateway: z.boolean().default(false) }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("choose"),
    provider: z.enum(["audit_only", "mock", "http_webhook"]),
    apiBaseUrl: z.string().url().optional().or(z.literal("")),
    apiKey: z.string().max(200).optional(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("set_gateway"), hasGateway: z.boolean() }),
  z.object({ slug: z.string().min(1), action: z.literal("test") }),
  z.object({ slug: z.string().min(1), action: z.literal("list_locks") }),
  z.object({ slug: z.string().min(1), action: z.literal("match"), roomUnitId: z.string().uuid(), externalLockId: z.string().min(1).max(80).nullable() }),
  z.object({ slug: z.string().min(1), action: z.literal("refresh_batteries") }),
  z.object({ slug: z.string().min(1), action: z.literal("unlock"), roomUnitId: z.string().uuid() }),
  z.object({ slug: z.string().min(1), action: z.literal("stay_code"), reservationId: z.string().uuid(), step: z.enum(["issue", "read", "revoke"]) }),
]);

const noStore = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const legacy = (auth.tenant as { smart_lock_setup?: unknown }).smart_lock_setup;
  const [conn, maps, events, rooms] = await Promise.all([
    loadConnection<LockConnectionConfig, { tokens?: unknown }>(auth.service, auth.tenant.id, "lock"),
    listLockMaps(auth.service, auth.tenant.id),
    recentIntegrationEvents(auth.service, auth.tenant.id, 12).catch(() => []),
    auth.service.schema("hotel").from("room_units").select("id,room_code").eq("tenant_id", auth.tenant.id).order("room_code"),
  ]);
  const legacyProvider = (legacy as { provider?: string } | null)?.provider;
  const { providerId } = await resolveLockProvider(auth.service, auth.tenant.id, legacy);
  const mapByRoom = new Map(maps.map((m) => [m.roomUnitId, m]));
  return NextResponse.json(
    {
      providers: LOCK_PROVIDERS,
      serverReady: { ttlock: Boolean(process.env.TTLOCK_CLIENT_ID && process.env.TTLOCK_CLIENT_SECRET) },
      connection: {
        provider: providerId,
        fromOldSetting: !conn && Boolean(legacyProvider),
        status: conn?.status ?? "active",
        signedIn: Boolean(conn?.secrets && (conn.secrets as { tokens?: unknown }).tokens),
        hasGateway: conn?.config?.hasGateway === true,
        apiBaseUrl: conn?.config?.apiBaseUrl ?? null,
        lastTestedAt: conn?.lastTestedAt ?? null,
        lastError: conn?.lastError ?? null,
      },
      lowBatteryPercent: LOW_BATTERY_PERCENT,
      rooms: ((rooms.data ?? []) as { id: string; room_code: string }[]).map((r) => ({
        id: r.id,
        code: r.room_code,
        lockId: mapByRoom.get(r.id)?.externalLockId ?? null,
        lockLabel: mapByRoom.get(r.id)?.label ?? null,
        battery: mapByRoom.get(r.id)?.battery ?? null,
      })),
      events,
    },
    { headers: noStore },
  );
}

export async function POST(req: Request) {
  try {
    const body = Body.parse(await req.json());

    // Door codes for a stay are a front desk job; everything else is the manager's.
    if (body.action === "stay_code") {
      const auth = await requireHotelApiSection(body.slug, STAY_SECTIONS);
      if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
      const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
      if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const legacy = (auth.tenant as { smart_lock_setup?: unknown }).smart_lock_setup;

      if (body.step === "read") {
        const c = await readStayCode(auth.service, auth.tenant.id, body.reservationId);
        await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "door_code_viewed", entityType: "reservation", entityId: body.reservationId });
        return NextResponse.json({ ok: true, code: c?.code ?? null, endsAt: c?.endsAt ?? null }, { headers: noStore });
      }
      if (body.step === "revoke") {
        const r = await revokeStayCodes({ db: auth.service, tenantId: auth.tenant.id, reservationId: body.reservationId, legacyRaw: legacy });
        await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "door_code_revoked", entityType: "reservation", entityId: body.reservationId, after: r });
        return NextResponse.json({ ok: r.failed === 0, ...r });
      }
      const { data: stay } = await auth.service.schema("hotel").from("reservations").select("room_unit_id").eq("tenant_id", auth.tenant.id).eq("id", body.reservationId).maybeSingle();
      const roomUnitId = (stay as { room_unit_id: string | null } | null)?.room_unit_id;
      if (!roomUnitId) return NextResponse.json({ error: "Give the booking a room before making a door code." }, { status: 409 });
      const r = await issueStayCode({ db: auth.service, tenantId: auth.tenant.id, reservationId: body.reservationId, roomUnitId, staffUserId: auth.user.id, legacyRaw: legacy });
      if (!r.ok) return NextResponse.json({ error: r.message }, { status: r.retryable ? 502 : 409 });
      await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "door_code_issued", entityType: "reservation", entityId: body.reservationId, after: { room_unit_id: roomUnitId, ends_at: r.endsAt } });
      return NextResponse.json({ ok: true, code: r.code, startsAt: r.startsAt, endsAt: r.endsAt }, { headers: noStore });
    }

    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!getRoomsCapabilities(auth.role).canRemoteUnlock) return NextResponse.json({ error: "Manager access required." }, { status: 403 });
    const tenantId = auth.tenant.id;
    const legacy = (auth.tenant as { smart_lock_setup?: unknown }).smart_lock_setup;
    const audit = (action: string, after?: Record<string, unknown>) =>
      writeAuditLog({ tenantId, actorUserId: auth.user.id, action, entityType: "lock_integration", entityId: tenantId, after });

    switch (body.action) {
      case "connect_ttlock": {
        const signed = await ttlockSignIn({}, body.username, body.password);
        if (!signed.ok) return NextResponse.json({ error: signed.error }, { status: 400 });
        const saved = await saveConnection(auth.service, {
          tenantId,
          kind: "lock",
          provider: "ttlock",
          config: { hasGateway: body.hasGateway },
          secrets: { tokens: signed.data },
          userId: auth.user.id,
        });
        if (saved.error) return NextResponse.json({ error: saved.error }, { status: 503 });
        await audit("lock_connected", { provider: "ttlock", has_gateway: body.hasGateway });
        const t = await testLockConnection(auth.service, tenantId, legacy);
        return NextResponse.json({ ok: true, lockCount: t.ok ? t.data.lockCount : null, warning: t.ok ? null : t.error });
      }
      case "choose": {
        const existing = await loadConnection<LockConnectionConfig>(auth.service, tenantId, "lock");
        const apiKey = body.apiKey || (existing?.provider === "http_webhook" ? (existing.secrets as { apiKey?: string } | null)?.apiKey : undefined);
        const saved = await saveConnection(auth.service, {
          tenantId,
          kind: "lock",
          provider: body.provider,
          config: { apiBaseUrl: body.apiBaseUrl || undefined },
          secrets: apiKey ? { apiKey } : null,
          userId: auth.user.id,
        });
        if (saved.error) return NextResponse.json({ error: saved.error }, { status: 503 });
        await audit("lock_provider_chosen", { provider: body.provider });
        return NextResponse.json({ ok: true });
      }
      case "set_gateway": {
        const existing = await loadConnection<LockConnectionConfig>(auth.service, tenantId, "lock");
        if (!existing || existing.provider !== "ttlock") return NextResponse.json({ error: "Connect TTLock first." }, { status: 409 });
        await saveConnection(auth.service, { tenantId, kind: "lock", provider: "ttlock", config: { ...existing.config, hasGateway: body.hasGateway } });
        await audit("lock_gateway_changed", { has_gateway: body.hasGateway });
        return NextResponse.json({ ok: true });
      }
      case "test": {
        const r = await testLockConnection(auth.service, tenantId, legacy);
        return r.ok ? NextResponse.json({ ok: true, lockCount: r.data.lockCount }) : NextResponse.json({ error: r.error }, { status: 502 });
      }
      case "list_locks": {
        const { provider } = await resolveLockProvider(auth.service, tenantId, legacy);
        if (!provider) return NextResponse.json({ error: "No lock system is connected." }, { status: 409 });
        const r = await provider.listLocks();
        return r.ok ? NextResponse.json({ ok: true, locks: r.data.locks }) : NextResponse.json({ error: r.error }, { status: 502 });
      }
      case "match": {
        const db = auth.service.schema("hotel").from("lock_room_maps");
        if (body.externalLockId === null) {
          await db.delete().eq("tenant_id", tenantId).eq("room_unit_id", body.roomUnitId);
        } else {
          // One lock belongs to one room: moving it clears its old room first.
          await auth.service.schema("hotel").from("lock_room_maps").delete().eq("tenant_id", tenantId).eq("external_lock_id", body.externalLockId);
          const { error } = await auth.service
            .schema("hotel")
            .from("lock_room_maps")
            .upsert({ tenant_id: tenantId, room_unit_id: body.roomUnitId, external_lock_id: body.externalLockId }, { onConflict: "tenant_id,room_unit_id" });
          if (error) return NextResponse.json({ error: "Could not match that lock." }, { status: 500 });
        }
        await audit("lock_matched", { room_unit_id: body.roomUnitId, external_lock_id: body.externalLockId });
        return NextResponse.json({ ok: true });
      }
      case "refresh_batteries": {
        const r = await refreshLockBatteries(auth.service, tenantId, legacy);
        return NextResponse.json({ ok: true, updated: r.updated, low: r.low });
      }
      case "unlock": {
        const { data: unit } = await auth.service.schema("hotel").from("room_units").select("room_code").eq("tenant_id", tenantId).eq("id", body.roomUnitId).maybeSingle();
        const r = await unlockRoomLock({ db: auth.service, tenantId, roomUnitId: body.roomUnitId, roomCode: (unit as { room_code?: string } | null)?.room_code, legacyRaw: legacy });
        await audit("lock_test_unlock", { room_unit_id: body.roomUnitId, ok: r.ok });
        return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: 502 });
      }
    }
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check the details." }, { status: 400 });
    console.error("[integrations/locks]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "That did not work. Please try again." }, { status: 500 });
  }
}
