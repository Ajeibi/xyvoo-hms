import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { LOST_FOUND_STATUSES, updateLostFoundItemStatus } from "@/lib/hms/housekeeping-lost-found";

const PatchSchema = z.object({
  slug: z.string().min(1),
  status: z.enum(LOST_FOUND_STATUSES),
  resolutionNotes: z.string().max(500).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canResolveLostFound) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    await updateLostFoundItemStatus(auth.service, {
      tenantId: auth.tenant.id,
      itemId: id,
      status: body.status,
      resolutionNotes: body.resolutionNotes ?? null,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping lost-found PATCH]", e);
    return NextResponse.json({ error: "Failed to update item." }, { status: 500 });
  }
}
