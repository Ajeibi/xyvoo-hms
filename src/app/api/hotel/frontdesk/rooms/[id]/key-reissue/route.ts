import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { executeKeyReissue } from "@/lib/hms/integrations/smart-lock";
import { verifyManagerPin } from "@/lib/hms/folio";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  reason: z.string().min(1).max(500),
  reissueCount: z.coerce.number().int().min(1).max(5).default(1),
  reservationId: z.string().uuid().optional(),
  managerPin: z.string().optional(),
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
    if (!caps.canKeyReissue) {
      return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    }

    if (body.reissueCount > 1 && !caps.canOverrideBlock) {
      const allowed = await verifyManagerPin(
        auth.service,
        auth.tenant.id,
        body.managerPin,
        auth.role,
      );
      if (!allowed) {
        return NextResponse.json(
          { error: "Manager PIN required for multiple reissues.", requiresPin: true },
          { status: 403 },
        );
      }
    }

    const { data: unit } = await auth.service
      .schema("hotel")
      .from("room_units")
      .select("room_code")
      .eq("id", id)
      .maybeSingle();

    const providerResult = await executeKeyReissue({
      supabase: auth.service,
      tenantId: auth.tenant.id,
      tenant: { smart_lock_setup: (auth.tenant as { smart_lock_setup?: unknown }).smart_lock_setup },
      roomUnitId: id,
      roomCode: unit?.room_code ?? id,
      reason: body.reason,
      staffUserId: auth.user.id,
      reservationId: body.reservationId,
      reissueCount: body.reissueCount,
    });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "key_reissued",
      entityType: "room_unit",
      entityId: id,
      after: { reason: body.reason, count: body.reissueCount },
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "key_reissued",
      title: "Key reissued",
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
    return NextResponse.json({ error: "Key reissue failed." }, { status: 500 });
  }
}
