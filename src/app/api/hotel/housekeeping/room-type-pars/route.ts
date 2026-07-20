import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { upsertRoomTypePar } from "@/lib/hms/housekeeping-inventory";

const PostSchema = z.object({
  slug: z.string().min(1),
  roomTypeCode: z.string().min(1),
  itemId: z.string().uuid(),
  parQty: z.number().min(0).max(999),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canConfigureSettings) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    await upsertRoomTypePar(auth.service, {
      tenantId: auth.tenant.id,
      roomTypeCode: body.roomTypeCode,
      itemId: body.itemId,
      parQty: body.parQty,
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping room-type-pars POST]", e);
    return NextResponse.json({ error: "Failed to save par." }, { status: 500 });
  }
}
