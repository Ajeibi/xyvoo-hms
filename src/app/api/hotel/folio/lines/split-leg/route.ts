import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { reassignFolioLinesSplitLeg } from "@/lib/hms/folio";
import { loadFolioPayload } from "../../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  lineIds: z.array(z.string().uuid()).min(1),
  splitLeg: z.enum(["guest", "company"]),
});

export async function PATCH(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const result = await reassignFolioLinesSplitLeg(auth.service, {
      tenantId: auth.tenant.id,
      reservationId: body.reservationId,
      lineIds: body.lineIds,
      splitLeg: body.splitLeg,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_lines_split_leg_reassigned",
      entityType: "folio_transaction",
      entityId: body.reservationId,
      after: { lineIds: body.lineIds, splitLeg: body.splitLeg, count: result.count },
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, count: result.count, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
