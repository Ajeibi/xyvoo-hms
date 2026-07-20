import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { appendGuestRequestEvent, computeExpectedCompletedIso } from "@/lib/hms/guest-services";
import { isKnownActiveCategory } from "@/lib/hms/guest-service-categories";
const PostSchema = z.object({
  slug: z.string().min(1),
  requestType: z.string().min(1).max(80),
  department: z.string().max(40).optional(),
  notes: z.string().max(500).optional(),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  requestId: z.string().uuid(),
  status: z.enum(["pending", "assigned", "in_progress", "waiting", "completed", "cancelled", "escalated"]),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data, error } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("id,request_type,department,status,notes,completed_at,created_at")
      .eq("tenant_id", auth.tenant.id)
      .eq("reservation_id", id)
      .order("created_at", { ascending: false });

    if (error) {
      if (error.code === "42P01") return NextResponse.json({ requests: [] });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      requests: (data ?? []).map((r) => ({
        id: r.id,
        requestType: r.request_type,
        department: r.department,
        status: r.status,
        notes: r.notes,
        completedAt: r.completed_at,
        createdAt: r.created_at,
      })),
    });
  } catch {
    return NextResponse.json({ error: "Failed to load requests." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const dept = (body.department ?? "front_desk").toLowerCase().replace(/\s+/g, "_");
    const isKnownCategory = await isKnownActiveCategory(auth.service, auth.tenant.id, dept);
    const serviceCategory = isKnownCategory ? dept : "special";

    const { data: resRow } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("room_unit_id,vip_flag")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    const createdAtIso = new Date().toISOString();
    const expectedAt = computeExpectedCompletedIso(createdAtIso, serviceCategory);

    const { data, error } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: id,
        request_type: body.requestType,
        department: dept,
        service_category: serviceCategory,
        notes: body.notes ?? null,
        created_by: auth.user.id,
        room_unit_id: resRow?.room_unit_id ?? null,
        is_vip_snapshot: Boolean(resRow?.vip_flag),
        expected_completed_at: expectedAt,
        status: "pending",
      })
      .select("id,request_type,department,status,notes,created_at")
      .single();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json(
          { error: "Guest requests table not migrated. Apply arrivals_wave_b migration." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await appendGuestRequestEvent(auth.service, {
      tenantId: auth.tenant.id,
      guestRequestId: data.id as string,
      action: "created",
      payload: { source: "arrivals", requestType: body.requestType },
      actorUserId: auth.user.id,
    });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "guest_request_added",
      entityType: "reservation",
      entityId: id,
      after: { request_type: body.requestType },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "guest_service_request",
      title: "New guest service request",
      body: `${body.requestType} — ${dept.replace(/_/g, " ")}`,
      severity: "info",
      entityType: "guest_request",
      entityId: data.id as string,
      department: dept,
    });

    return NextResponse.json({ ok: true, request: data });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to add request." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const updates: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
    if (body.status === "completed") updates.completed_at = new Date().toISOString();

    const { error } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("reservation_id", id)
      .eq("id", body.requestId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
