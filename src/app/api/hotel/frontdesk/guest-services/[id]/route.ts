import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { getGuestServicesCapabilities } from "@/lib/hms/guest-services-rbac";
import {
  appendGuestRequestEvent,
  canTransitionStatus,
  getGuestRequestDetail,
  GUEST_REQUEST_PRIORITIES,
} from "@/lib/hms/guest-services";

const PatchBody = z
  .object({
    slug: z.string().min(1),
    status: z
      .enum(["pending", "assigned", "in_progress", "waiting", "completed", "cancelled", "escalated"])
      .optional(),
    department: z.string().max(40).optional(),
    priority: z.enum(GUEST_REQUEST_PRIORITIES).optional(),
    assignedUserId: z.string().uuid().nullable().optional(),
    expectedCompletedAt: z.string().nullable().optional(),
  })
  .refine(
    (d) =>
      d.status != null ||
      d.department != null ||
      d.priority != null ||
      d.assignedUserId !== undefined ||
      d.expectedCompletedAt !== undefined,
    { message: "No updates provided" },
  );

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

    const caps = getGuestServicesCapabilities(auth.role);
    if (!caps.canView) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const detail = await getGuestRequestDetail(auth.service, auth.tenant.id, id, caps);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json(detail);
  } catch {
    return NextResponse.json({ error: "Failed to load request." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getGuestServicesCapabilities(auth.role);
    if (!caps.canUpdate) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: existing, error: exErr } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("id,status,department,reservation_id,request_type,assigned_user_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (exErr || !existing) return NextResponse.json({ error: "Not found." }, { status: 404 });
    if (caps.departmentScope && (existing.department as string) !== caps.departmentScope) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const fromStatus = existing.status as string;

    if (body.status != null) {
      if (!canTransitionStatus(fromStatus, body.status)) {
        return NextResponse.json(
          { error: `Invalid status transition ${fromStatus} → ${body.status}.` },
          { status: 400 },
        );
      }
      updates.status = body.status;
      if (body.status === "completed") updates.completed_at = new Date().toISOString();
      if (body.status === "assigned" && fromStatus === "pending") {
        updates.assigned_at = new Date().toISOString();
      }
    }
    if (body.department != null) updates.department = body.department;
    if (body.priority != null) updates.priority = body.priority;
    if (body.assignedUserId !== undefined) updates.assigned_user_id = body.assignedUserId;
    if (body.expectedCompletedAt !== undefined) updates.expected_completed_at = body.expectedCompletedAt;

    const prevAssignee = existing.assigned_user_id as string | null;
    if (
      body.assignedUserId !== undefined &&
      body.assignedUserId != null &&
      body.assignedUserId !== prevAssignee
    ) {
      updates.assigned_at = new Date().toISOString();
    }

    const { error } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (body.status != null) {
      await appendGuestRequestEvent(auth.service, {
        tenantId: auth.tenant.id,
        guestRequestId: id,
        action: "status_changed",
        payload: { from: fromStatus, to: body.status },
        actorUserId: auth.user.id,
      });
    } else {
      await appendGuestRequestEvent(auth.service, {
        tenantId: auth.tenant.id,
        guestRequestId: id,
        action: "updated",
        payload: {
          department: body.department,
          priority: body.priority,
          assignedUserId: body.assignedUserId,
          expectedCompletedAt: body.expectedCompletedAt,
        },
        actorUserId: auth.user.id,
      });
    }

    if (body.status === "escalated") {
      await emitNotification({
        tenantId: auth.tenant.id,
        type: "guest_service_escalated",
        title: "Guest service escalated",
        body: `${existing.request_type as string} (request ${id.slice(0, 8)}…)`,
        severity: "warning",
        entityType: "guest_request",
        entityId: id,
      });
    }

    if (body.status === "completed") {
      await emitNotification({
        tenantId: auth.tenant.id,
        type: "guest_service_completed",
        title: "Guest service completed",
        body: `${existing.request_type as string}`,
        severity: "info",
        entityType: "guest_request",
        entityId: id,
      });
    }

    if (
      body.assignedUserId !== undefined &&
      body.assignedUserId != null &&
      body.assignedUserId !== prevAssignee
    ) {
      await emitNotification({
        tenantId: auth.tenant.id,
        type: "guest_service_assigned",
        title: "Guest service assigned",
        body: `${existing.request_type as string} (request ${id.slice(0, 8)}…)`,
        severity: "info",
        entityType: "guest_request",
        entityId: id,
      });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "guest_service_request_updated",
      entityType: "guest_request",
      entityId: id,
      after: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
