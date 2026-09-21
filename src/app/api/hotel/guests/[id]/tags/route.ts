import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { GUEST_TAGS, setGuestTag } from "@/lib/hms/guest-management";

const BodySchema = z.object({
  slug: z.string().min(1),
  tag: z.enum(GUEST_TAGS),
  enabled: z.boolean(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const capabilities = getArrivalsCapabilities(auth.role);
    if (!capabilities.canEditNotes) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await setGuestTag(auth.service, {
      tenantId: auth.tenant.id,
      guestId: id,
      tag: body.tag,
      enabled: body.enabled,
      actorUserId: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, tags: result.tags });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not update guest tags." }, { status: 500 });
  }
}
