import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { verifyManagerPin } from "@/lib/hms/folio";
import { setStayCreditLimit } from "@/lib/hms/folio-credit-limits";
import { loadFolioPayload } from "../_lib";

/**
 * POST /api/hotel/folio/credit-limit — give a stay its own credit limit, or clear it so the
 * hotel's default applies. Staff who aren't admins need the manager PIN.
 */

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  limit: z.number().positive("The limit must be more than zero.").max(1_000_000_000_000).nullable(),
  managerPin: z.string().max(12).optional(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pinOk = await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role);
    if (!pinOk) {
      return NextResponse.json({ error: "A manager's PIN is needed to change a stay's credit limit.", needsPin: true }, { status: 403 });
    }

    const result = await setStayCreditLimit(auth.service, { tenantId: auth.tenant.id, reservationId: body.reservationId, limit: body.limit });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "stay_credit_limit_set",
      entityType: "reservation",
      entityId: body.reservationId,
      before: { creditLimit: result.before },
      after: { creditLimit: body.limit },
    });
    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, credit: payload?.credit ?? null });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
