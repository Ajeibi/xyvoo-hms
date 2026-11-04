import { NextResponse } from "next/server";
import { z } from "zod";
import { canManageGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { eraseGuest } from "@/lib/hms/guest-consent";

const BodySchema = z.object({ slug: z.string().min(1), note: z.string().max(300).optional().nullable() });

/** POST /api/hotel/guests/:id/erase: wipe a guest's personal details (a data erasure request). Managers only. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canManageGuests(auth.role, auth.departmentRole)) {
      return NextResponse.json({ error: "Only a manager can erase a guest's details." }, { status: 403 });
    }
    const result = await eraseGuest(auth.service, { tenantId: auth.tenant.id, guestId: id, actorUserId: auth.user.id, note: body.note });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not erase the guest's details." }, { status: 500 });
  }
}
