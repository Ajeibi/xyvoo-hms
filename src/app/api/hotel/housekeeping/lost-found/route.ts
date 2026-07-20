import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { createLostFoundItem } from "@/lib/hms/housekeeping-lost-found";

const PostSchema = z.object({
  slug: z.string().min(1),
  roomCode: z.string().max(20).optional(),
  reservationId: z.string().uuid().optional(),
  description: z.string().min(1).max(500),
  photoUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canLogLostFound) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    let roomUnitId: string | null = null;
    if (body.roomCode) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("id")
        .eq("tenant_id", auth.tenant.id)
        .eq("room_code", body.roomCode.trim())
        .maybeSingle();
      roomUnitId = unit?.id ?? null;
    }

    await createLostFoundItem(auth.service, {
      tenantId: auth.tenant.id,
      roomUnitId,
      reservationId: body.reservationId ?? null,
      description: body.description,
      photoUrl: body.photoUrl ?? null,
      foundByUserId: auth.user.id,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping lost-found POST]", e);
    return NextResponse.json({ error: "Failed to log item." }, { status: 500 });
  }
}
