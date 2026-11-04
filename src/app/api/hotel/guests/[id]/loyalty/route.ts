import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { addLoyaltyPoints } from "@/lib/hms/guest-loyalty";

const BodySchema = z.object({
  slug: z.string().min(1),
  kind: z.enum(["redeem", "adjust"]),
  points: z.number().int().min(-10000000).max(10000000),
  note: z.string().trim().min(1, "Say why.").max(300),
});

/** POST /api/hotel/guests/:id/loyalty: spend a guest's points, or correct their balance. Managers only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canManageGuests(auth.role, auth.departmentRole)) return NextResponse.json({ error: "Only a manager can change a guest's points." }, { status: 403 });

    const result = await addLoyaltyPoints(auth.service, {
      tenantId: auth.tenant.id,
      guestId: id,
      actorUserId: auth.user.id,
      kind: body.kind,
      points: body.points,
      note: body.note,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not save points." }, { status: 500 });
  }
}
