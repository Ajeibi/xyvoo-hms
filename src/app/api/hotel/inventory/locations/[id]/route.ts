import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { updateLocation } from "@/lib/hms/inventory-items";

const PatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  locationTypeId: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { location, error } = await updateLocation(auth.service, auth.tenant.id, id, {
      name: body.name,
      locationTypeId: body.locationTypeId,
      isActive: body.isActive,
    });
    if (error || !location) {
      return NextResponse.json({ error: error ?? "Could not update store location." }, { status: 400 });
    }

    return NextResponse.json({ location });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
