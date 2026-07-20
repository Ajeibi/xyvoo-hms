import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyGuestIncidentLogged } from "@/lib/hms/notification-rules";
import { getRequestsIncidentsCapabilities } from "@/lib/hms/requests-incidents-rbac";
import {
  GUEST_INCIDENT_CASE_TYPES,
  GUEST_INCIDENT_SEVERITIES,
  GUEST_INCIDENT_STATUSES,
  listGuestIncidents,
} from "@/lib/hms/guest-incidents";
import { resolveReservationIdByCode } from "@/lib/hms/guest-services";

const ListQuery = z.object({
  slug: z.string().min(1),
  q: z.string().optional(),
  caseType: z.enum(GUEST_INCIDENT_CASE_TYPES).optional(),
  status: z.enum(GUEST_INCIDENT_STATUSES).optional(),
  severity: z.enum(GUEST_INCIDENT_SEVERITIES).optional(),
});

const PostBody = z.object({
  slug: z.string().min(1),
  caseType: z.enum(GUEST_INCIDENT_CASE_TYPES),
  category: z.string().min(1).max(60),
  severity: z.enum(GUEST_INCIDENT_SEVERITIES).optional(),
  description: z.string().min(1).max(4000),
  reservationId: z.string().uuid().optional(),
  confirmationCode: z.string().max(40).optional(),
  roomCode: z.string().max(20).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = ListQuery.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? undefined,
      caseType: url.searchParams.get("caseType") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      severity: url.searchParams.get("severity") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRequestsIncidentsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });

    const payload = await listGuestIncidents(auth.service, auth.tenant.id, {
      q: query.q,
      caseType: query.caseType,
      status: query.status,
      severity: query.severity,
    });

    return NextResponse.json({ ...payload, capabilities: caps });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[incidents GET]", e);
    return NextResponse.json({ error: "Failed to load complaints & incidents." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRequestsIncidentsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canCreate) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    let reservationId = body.reservationId ?? null;
    if (!reservationId && body.confirmationCode) {
      reservationId = await resolveReservationIdByCode(auth.service, auth.tenant.id, body.confirmationCode);
    }

    let roomUnitId: string | null = null;
    if (body.roomCode?.trim()) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("id")
        .eq("tenant_id", auth.tenant.id)
        .eq("room_code", body.roomCode.trim())
        .maybeSingle();
      roomUnitId = (unit?.id as string | undefined) ?? null;
    }

    if (!roomUnitId && reservationId) {
      const { data: resRow } = await auth.service
        .schema("hotel")
        .from("reservations")
        .select("room_unit_id")
        .eq("tenant_id", auth.tenant.id)
        .eq("id", reservationId)
        .maybeSingle();
      roomUnitId = (resRow?.room_unit_id as string | null) ?? null;
    }

    const severity = body.severity ?? "normal";

    const { data: row, error } = await auth.service
      .schema("hotel")
      .from("guest_incidents")
      .insert({
        tenant_id: auth.tenant.id,
        case_type: body.caseType,
        reservation_id: reservationId,
        room_unit_id: roomUnitId,
        category: body.category,
        severity,
        status: "open",
        description: body.description,
        reported_by: auth.user.id,
      })
      .select("id")
      .single();

    if (error || !row) {
      console.error("[incidents POST]", error);
      return NextResponse.json({ error: "Could not log this." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.caseType === "complaint" ? "complaint_logged" : "incident_logged",
      entityType: "guest_incident",
      entityId: row.id as string,
      after: { caseType: body.caseType, category: body.category, severity },
    });

    await notifyGuestIncidentLogged({
      tenantId: auth.tenant.id,
      caseType: body.caseType,
      category: body.category,
      incidentSeverity: severity,
      entityId: row.id as string,
    });

    return NextResponse.json({ ok: true, id: row.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[incidents POST]", e);
    return NextResponse.json({ error: "Failed to log this." }, { status: 500 });
  }
}
