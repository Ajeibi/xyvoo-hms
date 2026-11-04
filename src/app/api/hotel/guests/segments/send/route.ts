import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { sendCampaign } from "@/lib/hms/guest-campaigns";

const BodySchema = z.object({
  slug: z.string().min(1),
  segmentKey: z.string().min(1).max(100),
  subject: z.string().max(200),
  message: z.string().max(6000),
  testOnly: z.boolean().default(false),
});

/**
 * POST /api/hotel/guests/segments/send: email an offer to the guests in a group who agreed to email offers
 * (or, with testOnly, just to the sender). Managers only.
 */
export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canManageGuests(auth.role, auth.departmentRole)) return NextResponse.json({ error: "Only a manager can send offers." }, { status: 403 });

    const result = await sendCampaign(auth.service, {
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      actorEmail: auth.user.email ?? null,
      origin: new URL(req.url).origin,
      segmentKey: body.segmentKey,
      subject: body.subject,
      message: body.message,
      testOnly: body.testOnly,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not send the offer." }, { status: 500 });
  }
}
