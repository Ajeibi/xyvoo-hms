import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { recordAudit } from "@/lib/hms/audit";

const Schema = z.object({
  slug: z.string().min(1),
  idleLockEnabled: z.boolean(),
  idleLockMinutes: z.number().int().min(1).max(120),
});

/** The hotel's lock-screen setting: lock after this many idle minutes (or never). Owner or admin only. */
export async function PUT(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });

    const { error } = await auth.service.schema("hotel").from("security_settings").upsert(
      {
        tenant_id: auth.tenant.id,
        idle_lock_enabled: body.idleLockEnabled,
        idle_lock_minutes: body.idleLockMinutes,
        updated_by: auth.user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "tenant_id" },
    );
    if (error) return NextResponse.json({ error: error.message || "Unable to save." }, { status: 400 });
    await recordAudit(auth.service, {
      tenantId: auth.tenant.id,
      action: "idle_lock_changed",
      entityType: "security_settings",
      after: { enabled: body.idleLockEnabled, minutes: body.idleLockMinutes },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
