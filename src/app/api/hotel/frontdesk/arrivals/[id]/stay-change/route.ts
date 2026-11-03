import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { emitNotification, writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import {
  applyStayChange,
  previewStayChange,
  STAY_CHANGE_RESERVATION_COLUMNS,
  type StayChangeReservation,
} from "@/lib/hms/stay-changes";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const BodySchema = z.object({
  slug: z.string().min(1),
  newDepartureDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a departure date."),
  /** Only work out what would happen. */
  preview: z.boolean().default(false),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, SECTIONS);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
    if (!caps.canCheckIn) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: resRow } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select(STAY_CHANGE_RESERVATION_COLUMNS)
      .eq("tenant_id", auth.tenant.id)
      .eq("id", id)
      .maybeSingle();
    if (!resRow) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    const reservation = resRow as unknown as StayChangeReservation;

    const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
    const worked = await previewStayChange(auth.service, {
      tenantId: auth.tenant.id,
      reservation,
      pricing,
      newDepartureDate: body.newDepartureDate,
      today: new Date().toISOString().slice(0, 10),
    });
    if (!worked.ok) return NextResponse.json({ error: worked.error }, { status: 400 });
    const { preview, plan } = worked;

    if (body.preview) return NextResponse.json({ preview, currency: pricing.currency });

    if (preview.blocker) return NextResponse.json({ error: preview.blocker }, { status: 409 });
    if (preview.conflicts.length > 0) {
      return NextResponse.json(
        { error: `The room is not free for those nights: ${preview.conflicts.map((c) => c.label).join("; ")}.`, preview },
        { status: 409 },
      );
    }

    const applied = await applyStayChange(auth.service, {
      tenantId: auth.tenant.id,
      reservation,
      pricing,
      plan,
      userId: auth.user.id,
    });
    if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: plan.kind === "extend" ? "stay_extended" : "stay_shortened",
      entityType: "reservation",
      entityId: id,
      before: { departure_at: reservation.departure_at, nights: reservation.nights },
      after: {
        departure_at: plan.newDepartureAt,
        nights: applied.newNights,
        bill_change: applied.billAmount,
      },
    });

    const { data: unit } = reservation.room_unit_id
      ? await auth.service.schema("hotel").from("room_units").select("room_code").eq("id", reservation.room_unit_id).maybeSingle()
      : { data: null };
    await emitNotification({
      tenantId: auth.tenant.id,
      type: "stay_dates_changed",
      title: plan.kind === "extend" ? "Stay extended" : "Guest leaving early",
      body: `${unit?.room_code ? `Room ${unit.room_code}` : "A room"} now departs ${plan.newDepartureDate}`,
      severity: "info",
      entityType: "reservation",
      entityId: id,
      department: "housekeeping",
    });

    return NextResponse.json({ ok: true, newNights: applied.newNights, billAmount: applied.billAmount });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[stay-change POST]", e);
    return NextResponse.json({ error: "Failed to change the stay." }, { status: 500 });
  }
}
