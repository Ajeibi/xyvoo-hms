import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { notificationVisibilityFilter } from "@/lib/hms/front-desk-ops";

const BodySchema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    // Scoped to what this viewer can actually see — otherwise a department-scoped user's
    // "mark all read" would silently mark other departments' notifications read too, since
    // read_at is a single tenant-wide column, not per-user.
    let query = auth.service
      .schema("hotel")
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("tenant_id", auth.tenant.id)
      .is("read_at", null);

    const scopeFilter = notificationVisibilityFilter(auth.departmentRole);
    if (scopeFilter) query = query.or(scopeFilter);

    const { error } = await query;

    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
