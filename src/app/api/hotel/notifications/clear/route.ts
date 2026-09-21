import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { notificationVisibilityFilter, writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getReadNotificationIds } from "@/lib/hms/notification-reads";

const BodySchema = z.object({
  slug: z.string().min(1),
  mode: z.enum(["read", "all"]).default("read"),
});

export async function DELETE(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Scoped the same way the list is, so clearing never removes a notification this
    // viewer couldn't see in the first place (they belong to another department).
    const scopeFilter = notificationVisibilityFilter(auth.departmentRole);

    if (body.mode === "read") {
      // Read state is per-user now (notification_reads) — "clear read" removes only what
      // *this* viewer has read, not a tenant-wide read_at that no longer gets written to.
      let idsQuery = auth.service.schema("hotel").from("notifications").select("id").eq("tenant_id", auth.tenant.id);
      if (scopeFilter) idsQuery = idsQuery.or(scopeFilter);
      const { data: visibleIdsData } = await idsQuery;
      const visibleIds = (visibleIdsData ?? []).map((n) => n.id as string);
      const readIds = await getReadNotificationIds(auth.service, auth.tenant.id, auth.user.id, visibleIds);
      if (readIds.size === 0) return NextResponse.json({ ok: true });

      const { error } = await auth.service
        .schema("hotel")
        .from("notifications")
        .delete()
        .eq("tenant_id", auth.tenant.id)
        .in("id", [...readIds]);
      if (error) return NextResponse.json({ error: "Could not clear notifications." }, { status: 500 });
    } else {
      let query = auth.service.schema("hotel").from("notifications").delete().eq("tenant_id", auth.tenant.id);
      if (scopeFilter) query = query.or(scopeFilter);
      const { error } = await query;
      if (error) return NextResponse.json({ error: "Could not clear notifications." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: `notifications_cleared_${body.mode}`,
      entityType: "notifications",
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
