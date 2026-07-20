import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import {
  appendGuestRequestEvent,
  computeExpectedCompletedIso,
  defaultDepartmentForCategory,
  listGuestRequestsForTenant,
  resolveReservationIdByCode,
  GUEST_REQUEST_PRIORITIES,
} from "@/lib/hms/guest-services";
import { getCategoryDepartment, isKnownActiveCategory } from "@/lib/hms/guest-service-categories";

const ListQuery = z.object({
  slug: z.string().min(1),
  q: z.string().optional(),
  status: z.string().optional(),
  priority: z.string().optional(),
  department: z.string().optional(),
  vipOnly: z.enum(["true", "false"]).optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

const PostBody = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid().optional(),
  confirmationCode: z.string().min(1).optional(),
  serviceCategory: z.string().min(1),
  requestType: z.string().min(1).max(120),
  details: z.string().max(2000).optional(),
  department: z.string().max(40).optional(),
  priority: z.enum(GUEST_REQUEST_PRIORITIES).optional(),
  billable: z.boolean().optional(),
  notes: z.string().max(500).optional(),
}).refine(
  (d) => (d.reservationId ?? d.confirmationCode) != null,
  { message: "reservationId or confirmationCode required" },
);

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = ListQuery.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      priority: url.searchParams.get("priority") ?? undefined,
      department: url.searchParams.get("department") ?? undefined,
      vipOnly: (url.searchParams.get("vipOnly") as "true" | "false" | null) ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canView) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const payload = await listGuestRequestsForTenant(
      auth.service,
      auth.tenant.id,
      {
        q: query.q,
        status: query.status,
        priority: query.priority,
        department: query.department,
        vipOnly: query.vipOnly === "true",
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
      },
      caps,
    );

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[guest-services GET]", e);
    return NextResponse.json({ error: "Failed to load guest services." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canCreate) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const validCategory = await isKnownActiveCategory(auth.service, auth.tenant.id, body.serviceCategory);
    if (!validCategory) {
      return NextResponse.json({ error: "Invalid serviceCategory" }, { status: 400 });
    }

    let reservationId = body.reservationId ?? null;
    if (!reservationId && body.confirmationCode) {
      reservationId = await resolveReservationIdByCode(
        auth.service,
        auth.tenant.id,
        body.confirmationCode,
      );
    }
    if (!reservationId) {
      return NextResponse.json({ error: "reservationId or confirmationCode required." }, { status: 400 });
    }

    const { data: resRow, error: resErr } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,room_unit_id,vip_flag")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", reservationId)
      .maybeSingle();

    if (resErr || !resRow) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    const categoryDept = await getCategoryDepartment(auth.service, auth.tenant.id, body.serviceCategory);
    const dept = (body.department ?? categoryDept ?? defaultDepartmentForCategory(body.serviceCategory)).toLowerCase();
    const priority = body.priority ?? "normal";
    const createdAtIso = new Date().toISOString();
    const expectedAt = computeExpectedCompletedIso(createdAtIso, body.serviceCategory);

    const { data: row, error } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .insert({
        tenant_id: auth.tenant.id,
        reservation_id: reservationId,
        room_unit_id: resRow.room_unit_id ?? null,
        request_type: body.requestType,
        service_category: body.serviceCategory,
        details: body.details ?? null,
        department: dept,
        status: dept !== "front_desk" ? "assigned" : "pending",
        priority,
        notes: body.notes ?? null,
        billable: body.billable ?? false,
        is_vip_snapshot: Boolean(resRow.vip_flag),
        expected_completed_at: expectedAt,
        assigned_at: dept !== "front_desk" ? createdAtIso : null,
        created_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "42703" || error.message.includes("column")) {
        return NextResponse.json(
          { error: "Guest services schema not migrated. Apply guest_services_workbench migration." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await appendGuestRequestEvent(auth.service, {
      tenantId: auth.tenant.id,
      guestRequestId: row.id as string,
      action: "created",
      payload: { requestType: body.requestType, serviceCategory: body.serviceCategory },
      actorUserId: auth.user.id,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "guest_service_request_created",
      entityType: "guest_request",
      entityId: row.id as string,
      after: { reservation_id: reservationId, request_type: body.requestType },
    });

    const vip = Boolean(resRow.vip_flag) || priority === "vip";
    await emitNotification({
      tenantId: auth.tenant.id,
      type: "guest_service_request",
      title: vip ? "VIP guest service request" : "New guest service request",
      body: `${body.requestType} — ${body.serviceCategory.replace(/_/g, " ")}`,
      severity: vip || priority === "urgent" ? "warning" : "info",
      entityType: "guest_request",
      entityId: row.id as string,
      department: dept,
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[guest-services POST]", e);
    return NextResponse.json({ error: "Failed to create request." }, { status: 500 });
  }
}
