import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationIds: z.array(z.string().uuid()).min(1).max(50),
  action: z.enum(["mark_confirmed", "export_codes"]),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: rows } = await auth.service
      .schema("hotel")
      .from("reservations")
      .select("id,confirmation_code,status")
      .eq("tenant_id", auth.tenant.id)
      .in("id", body.reservationIds);

    if (!rows?.length) {
      return NextResponse.json({ error: "No reservations found." }, { status: 404 });
    }

    if (body.action === "export_codes") {
      return NextResponse.json({
        ok: true,
        codes: rows.map((r) => ({ id: r.id, confirmationCode: r.confirmation_code, status: r.status })),
      });
    }

    if (body.action === "mark_confirmed") {
      const eligible = rows.filter((r) => r.status === "no_show" || r.status === "cancelled");
      if (eligible.length === 0) {
        return NextResponse.json({ error: "No eligible reservations to update." }, { status: 400 });
      }
      await auth.service
        .schema("hotel")
        .from("reservations")
        .update({ status: "confirmed" })
        .in(
          "id",
          eligible.map((r) => r.id),
        );

      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "bulk_status_confirmed",
        entityType: "reservation",
        entityId: null,
        after: { count: eligible.length, ids: eligible.map((r) => r.id) },
      });
    }

    return NextResponse.json({ ok: true, processed: rows.length });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Bulk action failed." }, { status: 500 });
  }
}
