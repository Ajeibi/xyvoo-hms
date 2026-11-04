import { NextResponse } from "next/server";
import { z } from "zod";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { guestFieldsSchema } from "@/lib/hms/guest-fields";
import { updateGuest } from "@/lib/hms/guest-edit";

const BodySchema = z.object({ slug: z.string().min(1), fields: guestFieldsSchema });

/** PATCH /api/hotel/guests/:id: change a guest's details. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireGuestsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await updateGuest(auth.service, {
      tenantId: auth.tenant.id,
      guestId: id,
      actorUserId: auth.user.id,
      fields: body.fields,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Could not save the guest." }, { status: 500 });
  }
}
