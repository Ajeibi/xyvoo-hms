import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { setStayAgent } from "@/lib/hms/folio-commission";
import { loadFolioPayload } from "../_lib";

/** POST /api/hotel/folio/agent — name (or clear) the travel agent who earns commission on a stay. */

const BodySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
  agentId: z.string().uuid().nullable(),
});

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const result = await setStayAgent(auth.service, { tenantId: auth.tenant.id, reservationId: body.reservationId, agentId: body.agentId });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "stay_agent_set",
      entityType: "reservation",
      entityId: body.reservationId,
      after: { agentId: body.agentId },
    });
    const payload = await loadFolioPayload(auth, body.reservationId);
    return NextResponse.json({ ok: true, agent: payload?.agent ?? null });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
