import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { saveLoyaltySettings } from "@/lib/hms/guest-loyalty";

const BodySchema = z.object({
  slug: z.string().min(1),
  enabled: z.boolean(),
  spendPerPoint: z.number().positive().max(100000000),
  pointValue: z.number().min(0).max(100000000),
  earnFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  tiers: z
    .array(z.object({ name: z.string().trim().min(1).max(40), minPoints: z.number().int().min(0).max(100000000), perks: z.string().max(300).default("") }))
    .min(1)
    .max(8),
});

/** PUT /api/hotel/guests/loyalty/settings: switch loyalty on, set the earning rate and the tiers. Managers only. */
export async function PUT(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canManageGuests(auth.role, auth.departmentRole)) return NextResponse.json({ error: "Only a manager can change loyalty settings." }, { status: 403 });

    const result = await saveLoyaltySettings(auth.service, {
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      settings: { enabled: body.enabled, spendPerPoint: body.spendPerPoint, pointValue: body.pointValue, earnFrom: body.earnFrom ?? null, tiers: body.tiers },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not save loyalty settings." }, { status: 500 });
  }
}
