import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { departmentScopeForRole } from "@/lib/hms/guest-services-rbac";
import { appendGuestRequestEvent, canTransitionStatus } from "@/lib/hms/guest-services";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const BodySchema = z.object({ slug: z.string().min(1) });

/** Marks a guest request routed to food and drink (a welcome fruit basket, say) as done. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const allowed = isAdminLikeRole(auth.role) || departmentScopeForRole(auth.departmentRole) === "food_beverage";
    if (!allowed) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: request } = await auth.service
      .schema("hotel")
      .from("guest_requests")
      .select("id,status,department")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (!request) return NextResponse.json({ error: "Request not found." }, { status: 404 });
    if (request.department !== "food_beverage") {
      return NextResponse.json({ error: "This request does not belong to food and drink." }, { status: 403 });
    }

    const status = request.status as string;
    const canCompleteDirectly = canTransitionStatus(status, "completed");
    if (!canCompleteDirectly && !canTransitionStatus(status, "in_progress")) {
      return NextResponse.json({ error: `Cannot complete a request in status ${status}.` }, { status: 400 });
    }

    const nowIso = new Date().toISOString();
    await auth.service
      .schema("hotel")
      .from("guest_requests")
      .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    await appendGuestRequestEvent(auth.service, {
      tenantId: auth.tenant.id,
      guestRequestId: id,
      action: "completed",
      payload: { source: "fb_guest_requests" },
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
    console.error("[fb guest-request complete]", e);
    return NextResponse.json({ error: "Failed to update request." }, { status: 500 });
  }
}
