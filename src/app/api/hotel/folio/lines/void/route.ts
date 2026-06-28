import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { verifyManagerPin } from "@/lib/hms/folio";
import { loadFolioPayload } from "../../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
  lineId: z.string().uuid(),
  reason: z.string().min(1).max(300),
  managerPin: z.string().optional(),
});

export async function PATCH(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const allowed = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
    if (!allowed) return NextResponse.json({ error: "Manager PIN required." }, { status: 403 });

    const { data: line } = await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .select("id,reservation_id,kind,voided_at")
      .eq("id", body.lineId)
      .eq("tenant_id", auth.tenant.id)
      .maybeSingle();

    if (!line || line.voided_at) {
      return NextResponse.json({ error: "Line not found or already voided." }, { status: 404 });
    }
    if (line.kind === "payment") {
      return NextResponse.json({ error: "Void payments via refund instead." }, { status: 400 });
    }

    const { error } = await auth.service
      .schema("hotel")
      .from("folio_transactions")
      .update({
        voided_at: new Date().toISOString(),
        voided_by: auth.user.id,
        void_reason: body.reason,
      })
      .eq("id", body.lineId);

    if (error) return NextResponse.json({ error: "Could not void line." }, { status: 500 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "folio_line_voided",
      entityType: "folio_transaction",
      entityId: body.lineId,
      after: { reason: body.reason },
    });

    const payload = await loadFolioPayload(auth, line.reservation_id as string);
    return NextResponse.json({ ok: true, folio: payload?.folio });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
