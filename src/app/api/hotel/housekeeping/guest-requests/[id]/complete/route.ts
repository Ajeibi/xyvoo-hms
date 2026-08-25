import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { appendGuestRequestEvent, canTransitionStatus } from "@/lib/hms/guest-services";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const BodySchema = z.object({ slug: z.string().min(1) });

/**
 * HK-11: completing a guest-request checklist item on a Housekeeping task marks the
 * corresponding `hotel.guest_requests` row `completed`, reusing Front Desk's existing
 * status lifecycle rather than a parallel Housekeeping-owned "done" flag.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: request } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("id,status,department")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (request.department !== "housekeeping") {
      return NextResponse.json({ error: "This request does not belong to Housekeeping." }, { status: 403 });
    }

    const status = request.status as string;
    const canCompleteDirectly = canTransitionStatus(status, "completed");
    /** "pending"/"assigned" can't jump straight to "completed" in the status machine — bridge
     * through "in_progress" first so a single "Mark done" click always works regardless of
     * where Front Desk left the request, instead of forcing staff to click through each step. */
    if (!canCompleteDirectly && !canTransitionStatus(status, "in_progress")) {
      return NextResponse.json({ error: `Cannot complete a request in status ${status}.` }, { status: 400 });
    }

    if (!canCompleteDirectly) {
      await auth.service
        .schema("hotel")
        .from("guest_requests")
        .update({ status: "in_progress", updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    await auth.service
      .schema("hotel")
      .from("guest_requests")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);

    await appendGuestRequestEvent(auth.service, {
      tenantId: auth.tenant.id,
      guestRequestId: id,
      action: "completed",
      payload: { source: "housekeeping_task" },
      actorUserId: auth.user.id,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "guest_service_request_completed",
      entityType: "guest_request",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping guest-request complete]", e);
    return NextResponse.json({ error: "Failed to update request." }, { status: 500 });
  }
}
