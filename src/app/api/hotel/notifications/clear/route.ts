import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const BodySchema = z.object({
  slug: z.string().min(1),
  mode: z.enum(["read", "all"]).default("read"),
});

export async function DELETE(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    let query = auth.service.schema("hotel").from("notifications").delete().eq("tenant_id", auth.tenant.id);

    if (body.mode === "read") {
      query = query.not("read_at", "is", null);
    }

    const { error } = await query;
    if (error) return NextResponse.json({ error: "Could not clear notifications." }, { status: 500 });

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
