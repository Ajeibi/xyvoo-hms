import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { syncLoyaltyEarnings } from "@/lib/hms/guest-loyalty";

const BodySchema = z.object({ slug: z.string().min(1) });

/** POST /api/hotel/guests/loyalty/sync: credit points for every finished stay that hasn't earned yet. */
export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canManageGuests(auth.role, auth.departmentRole)) return NextResponse.json({ error: "Only a manager can do this." }, { status: 403 });
    const result = await syncLoyaltyEarnings(auth.service, auth.tenant.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not credit points." }, { status: 500 });
  }
}
