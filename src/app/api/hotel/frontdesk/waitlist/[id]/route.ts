import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getRequestsIncidentsCapabilities } from "@/lib/hms/requests-incidents-rbac";
import { WAITLIST_STATUSES, canTransitionWaitlistStatus } from "@/lib/hms/waitlist";

const PatchBody = z.object({
  slug: z.string().min(1),
  status: z.enum(WAITLIST_STATUSES),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRequestsIncidentsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageWaitlist) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: existing, error: exErr } = await auth.service
      .schema("hotel")
      .from("waitlist_entries")
      .select("id,status")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (exErr || !existing) return NextResponse.json({ error: "Not found." }, { status: 404 });

    const fromStatus = existing.status as (typeof WAITLIST_STATUSES)[number];
    if (!canTransitionWaitlistStatus(fromStatus, body.status)) {
      return NextResponse.json(
        { error: `Invalid status transition ${fromStatus} → ${body.status}.` },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = { status: body.status, updated_at: new Date().toISOString() };
    if (body.status === "notified") updates.notified_at = new Date().toISOString();

    const { error } = await auth.service
      .schema("hotel")
      .from("waitlist_entries")
      .update(updates)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "waitlist_entry_updated",
      entityType: "waitlist_entry",
      entityId: id,
      before: { status: fromStatus },
      after: { status: body.status },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[waitlist PATCH]", e);
    return NextResponse.json({ error: "Update failed." }, { status: 500 });
  }
}
