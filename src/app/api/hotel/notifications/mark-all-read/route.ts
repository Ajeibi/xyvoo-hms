import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { notificationVisibilityFilter } from "@/lib/hms/front-desk-ops";
import { markNotificationsRead } from "@/lib/hms/notification-reads";

const BodySchema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Scoped to what this viewer can actually see — a department-scoped user's "mark all
    // read" only touches notifications visible to their department. Read state is per-user
    // (notification_reads), so this never affects what any other viewer sees as unread.
    let query = auth.service.schema("hotel").from("notifications").select("id").eq("tenant_id", auth.tenant.id);

    const scopeFilter = notificationVisibilityFilter(auth.departmentRole);
    if (scopeFilter) query = query.or(scopeFilter);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    const result = await markNotificationsRead(
      auth.service,
      auth.tenant.id,
      auth.user.id,
      (data ?? []).map((n) => n.id as string),
    );
    if (!result.ok) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
