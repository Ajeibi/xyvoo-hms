import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { countActiveKeys, KEY_TYPES, keyIssueBlocker, listReservationKeys } from "@/lib/hms/reservation-keys";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const IssueSchema = z.object({
  slug: z.string().min(1),
  keyType: z.enum(KEY_TYPES).default("card"),
  label: z.string().trim().max(40).optional(),
});

const RevokeSchema = z.object({
  slug: z.string().min(1),
  keyId: z.string().uuid(),
  reason: z.string().trim().min(1, "Say why the key is being revoked.").max(200),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiSection(slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const keys = await listReservationKeys(auth.service, auth.tenant.id, id);
    return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Failed to load keys." }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = IssueSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: resRow } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,status,room_unit_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();
    if (!resRow) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    const existing = await listReservationKeys(auth.service, auth.tenant.id, id);
    const blocker = keyIssueBlocker({
      status: resRow.status as string,
      roomUnitId: (resRow.room_unit_id as string | null) ?? null,
      activeKeys: countActiveKeys(existing),
    });
    if (blocker) return NextResponse.json({ error: blocker }, { status: 409 });

    const { data: created, error } = await auth.service
      .schema("hotel")
      .from("reservation_keys")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: id,
        room_unit_id: resRow.room_unit_id,
        key_type: body.keyType,
        label: body.label || null,
        issued_by: auth.user.id,
      })
      .select("id")
      .single();
    if (error || !created) {
      if (error?.code === "42P01") {
        return NextResponse.json({ error: "Keys are not set up yet. Apply the reservation_keys migration." }, { status: 503 });
      }
      return NextResponse.json({ error: "Could not record the key." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "key_issued",
      entityType: "reservation",
      entityId: id,
      after: { key_id: created.id, key_type: body.keyType, label: body.label ?? null },
    });
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[keys POST]", e);
    return NextResponse.json({ error: "Failed to issue the key." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = RevokeSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: revoked } = await auth.service
      .schema("hotel")
      .from("reservation_keys")
      .update({
        status: "revoked",
        revoked_at: new Date().toISOString(),
        revoked_by: auth.user.id,
        revoke_reason: body.reason,
      })
      .eq("tenant_id", auth.tenant.id)
      .eq("reservation_id", id)
      .eq("id", body.keyId)
      .eq("status", "issued")
      .select("id");
    if (!revoked || revoked.length === 0) {
      return NextResponse.json({ error: "That key is not live on this booking." }, { status: 404 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "key_revoked",
      entityType: "reservation",
      entityId: id,
      after: { key_id: body.keyId, reason: body.reason },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[keys PATCH]", e);
    return NextResponse.json({ error: "Failed to revoke the key." }, { status: 500 });
  }
}
