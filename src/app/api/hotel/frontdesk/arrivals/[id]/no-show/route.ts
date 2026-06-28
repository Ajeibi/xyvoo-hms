import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { insertFolioLine } from "@/lib/hms/folio";

const PostSchema = z.object({
  slug: z.string().min(1),
  penaltyAmount: z.coerce.number().min(0).optional(),
  releaseRoom: z.coerce.boolean().optional(),
});

const PatchSchema = z.object({
  slug: z.string().min(1),
  action: z.literal("reopen"),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: reservation, error } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,confirmation_code,status,room_unit_id")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (error || !reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }

    if (!["confirmed", "checked_in"].includes(reservation.status)) {
      return NextResponse.json({ error: "Cannot mark this stay as no-show." }, { status: 400 });
    }

    const releaseRoom = body.releaseRoom !== false;
    const updates: Record<string, unknown> = { status: "no_show" };
    if (releaseRoom) updates.room_unit_id = null;

    await auth.service
      .schema("hotel")
      .from("reservations")
      .update(updates)
      .eq("id", id);

    if (body.penaltyAmount && body.penaltyAmount > 0) {
      await insertFolioLine(auth.service, {
        tenantId: auth.tenant.id,
        reservationId: id,
        kind: "charge",
        amount: body.penaltyAmount,
        method: "system",
        description: "No-show penalty",
        department: "rooms",
        postedBy: auth.user.id,
      });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "no_show",
      entityType: "reservation",
      entityId: id,
      before: { status: reservation.status, room_unit_id: reservation.room_unit_id },
      after: updates,
    });

    await emitNotification({
      tenantId: auth.tenant.id,
      type: "no_show",
      title: "No-show recorded",
      body: `Reservation ${reservation.confirmation_code} marked no-show.`,
      severity: "warning",
      entityType: "reservation",
      entityId: id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "No-show failed." }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: reservation } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,status,confirmation_code")
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();

    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found." }, { status: 404 });
    }
    if (reservation.status !== "no_show") {
      return NextResponse.json({ error: "Only no-show reservations can be reopened." }, { status: 400 });
    }

    await auth.service
      .schema("hotel")
      .from("reservations")
      .update({ status: "confirmed" })
      .eq("id", id);

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "no_show_reopened",
      entityType: "reservation",
      entityId: id,
      before: { status: "no_show" },
      after: { status: "confirmed" },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Reopen failed." }, { status: 500 });
  }
}
