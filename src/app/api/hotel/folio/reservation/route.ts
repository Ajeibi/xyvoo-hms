import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { loadFolioPayload } from "../_lib";

const PatchSchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  billToAccount: z.string().max(200).optional().nullable(),
  poNumber: z.string().max(80).optional().nullable(),
  folioSplitNotes: z.string().max(500).optional().nullable(),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const patch: Record<string, unknown> = {};
    if (body.billToAccount !== undefined) patch.bill_to_account = body.billToAccount;
    if (body.poNumber !== undefined) patch.po_number = body.poNumber;
    if (body.folioSplitNotes !== undefined) patch.folio_split_notes = body.folioSplitNotes;

    const { error } = await auth.service
      .schema("hotel")
      .from("reservations")
      .update(patch)
      .eq("id", body.reservationId)
      .eq("tenant_id", auth.tenant.id);

    if (error) return NextResponse.json({ error: "Update failed." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "corporate_billing_updated",
      entityType: "reservation",
      entityId: body.reservationId,
      after: patch,
    });

    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, reservation: payload?.reservation, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
