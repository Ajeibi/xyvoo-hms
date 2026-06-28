import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { executeRemoteUnlock } from "@/lib/hms/integrations/smart-lock";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  reason: z.string().min(1).max(500),
  confirm: z.literal(true),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canRemoteUnlock) {
      return NextResponse.json({ error: "Remote unlock not permitted for your role." }, { status: 403 });
    }

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("id", id)
      .maybeSingle();

    const providerResult = await executeRemoteUnlock({
      supabase: auth.service,
      tenantId: auth.tenant.id,
      tenant: { smart_lock_setup: (auth.tenant as { smart_lock_setup?: unknown }).smart_lock_setup },
      roomUnitId: id,
      roomCode: unit?.room_code ?? id,
      reason: body.reason,
      staffUserId: auth.user.id,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_unlock",
      entityType: "room_unit",
      entityId: id,
      after: { reason: body.reason, provider: providerResult.mode },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "room_unlock",
      title: "Remote unlock",
      body: `Room ${unit?.room_code ?? id}: ${providerResult.message}`,
      severity: "info",
      entityType: "room_unit",
      entityId: id,
    });

    return NextResponse.json({
      ok: true,
      message: providerResult.message,
      providerMode: providerResult.mode,
      executed: providerResult.executed,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Unlock failed." }, { status: 500 });
  }
}
