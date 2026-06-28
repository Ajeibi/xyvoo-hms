import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { insertFolioLine } from "@/lib/hms/folio";
import { loadFolioPayload, loadReservation } from "../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  lineId: z.string().uuid(),
  targetReservationId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: line } = await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .select("*")
      .eq("id", body.lineId)
      .eq("tenant_id", auth.tenant.id)
      .maybeSingle();

    if (!line || line.voided_at) {
      return NextResponse.json({ error: "Line not found." }, { status: 404 });
    }
    if (line.kind !== "charge") {
      return NextResponse.json({ error: "Only charges can be transferred." }, { status: 400 });
    }

    const target = await loadReservation(auth, body.targetReservationId);
    if (!target) return NextResponse.json({ error: "Target reservation not found." }, { status: 404 });

    await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: auth.user.id,
        void_reason: `Transferred to ${target.confirmation_code}`,
      })
      .eq("id", body.lineId);

    const amount = Math.abs(Number(line.amount));
    const { line: newLine, error } = await insertFolioLine(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.targetReservationId,
      kind: "charge",
      amount,
      method: line.method as string,
      description: (line.description as string) ?? "Transferred charge",
      postedBy: auth.user.id,
      splitLeg: (line.split_leg as "guest" | "company") ?? "guest",
      relatedReservationId: line.reservation_id as string,
    });
    if (error || !newLine) {
      return NextResponse.json({ error: error ?? "Transfer failed." }, { status: 500 });
    }

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_charge_transferred",
      entityType: "folio_transaction",
      entityId: newLine.id,
      after: { from: line.reservation_id, to: body.targetReservationId },
    });

    const [sourceFolio, targetFolio] = await Promise.all([
      loadFolioPayload(auth, line.reservation_id as string),
      loadFolioPayload(auth, body.targetReservationId),
    ]);
    return NextResponse.json({ ok: true, sourceFolio: sourceFolio?.folio, targetFolio: targetFolio?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
