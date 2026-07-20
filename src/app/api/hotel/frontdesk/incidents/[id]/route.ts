import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { notifyGuestIncidentEscalated } from "@/lib/hms/notification-rules";
import { getRequestsIncidentsCapabilities } from "@/lib/hms/requests-incidents-rbac";
import { CANONICAL_DEPARTMENTS, GUEST_INCIDENT_STATUSES, canTransitionIncidentStatus } from "@/lib/hms/guest-incidents";
import { listGuestServiceCategories } from "@/lib/hms/guest-service-categories";

const PatchBody = z
  .object({
    slug: z.string().min(1),
    status: z.enum(GUEST_INCIDENT_STATUSES).optional(),
    resolutionNotes: z.string().max(4000).optional(),
    compensationOffered: z.string().max(500).optional(),
    escalateToDepartment: z.string().min(1).max(40).optional(),
    markGuestNotified: z.boolean().optional(),
  })
  .refine(
    (d) =>
      d.status != null ||
      d.resolutionNotes != null ||
      d.compensationOffered != null ||
      d.escalateToDepartment != null ||
      d.markGuestNotified === true,
    { message: "No updates provided" },
  );

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRequestsIncidentsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canUpdate) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: existing, error: exErr } = await auth.service
      .schema("hotel")
      .from("guest_incidents")
      .select("id,case_type,status,category")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (exErr || !existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const fromStatus = existing.status as (typeof GUEST_INCIDENT_STATUSES)[number];
    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_at: nowIso };

    if (body.escalateToDepartment) {
      if (!caps.canEscalate) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

      const categories = await listGuestServiceCategories(auth.service, auth.tenant.id, { activeOnly: true });
      const knownDepartments = new Set<string>([...CANONICAL_DEPARTMENTS, ...categories.map((c) => c.department)]);
      if (!knownDepartments.has(body.escalateToDepartment)) {
        return NextResponse.json({ error: "Unknown department for this hotel." }, { status: 400 });
      }

      if (!canTransitionIncidentStatus(fromStatus, "escalated")) {
        return NextResponse.json({ error: `Cannot escalate from ${fromStatus}.` }, { status: 400 });
      }

      updates.status = "escalated";
      updates.escalated_to_department = body.escalateToDepartment;
      updates.escalated_at = nowIso;
    } else if (body.status != null) {
      if (!canTransitionIncidentStatus(fromStatus, body.status)) {
        return NextResponse.json(
          { error: `Invalid status transition ${fromStatus} → ${body.status}.` },
          { status: 400 },
        );
      }
      updates.status = body.status;
    }

    if (body.resolutionNotes != null) updates.resolution_notes = body.resolutionNotes;
    if (body.compensationOffered != null) updates.compensation_offered = body.compensationOffered;
    if (body.markGuestNotified) updates.guest_notified_at = nowIso;

    const { error } = await auth.service
      .schema("hotel")
      .from("guest_incidents")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.escalateToDepartment ? "guest_incident_escalated" : "guest_incident_updated",
      entityType: "guest_incident",
      entityId: id,
      before: { status: fromStatus },
      after: updates,
    });

    if (body.escalateToDepartment) {
      await notifyGuestIncidentEscalated({
        tenantId: auth.tenant.id,
        caseType: existing.case_type as "complaint" | "incident",
        category: existing.category as string,
        department: body.escalateToDepartment,
        entityId: id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[incidents PATCH]", e);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
