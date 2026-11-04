import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";
import { listRoomTypeLimits, saveRoomTypeLimit } from "@/lib/hms/reservation-availability";

/**
 * GET /api/hotel/reservations/limits?slug= — how many rooms above its stock each room type may sell.
 * POST — set one room type's allowance. Changes are for owners and admins.
 */

async function payload(auth: { service: Parameters<typeof listRoomTypeLimits>[0]; tenant: { id: string; room_types: unknown } }) {
  const limits = await listRoomTypeLimits(auth.service, auth.tenant.id);
  const { data: units } = await auth.service.schema("hotel").from("room_units").select("room_type_code").eq("tenant_id", auth.tenant.id);
  const stock = new Map<string, number>();
  for (const u of units ?? []) stock.set(u.room_type_code as string, (stock.get(u.room_type_code as string) ?? 0) + 1);
  return {
    roomTypes: normalizeRoomTypes(auth.tenant.room_types).map((t) => ({
      id: t.id,
      name: t.name,
      rooms: stock.get(t.id) ?? 0,
      overbookRooms: limits.find((l) => l.roomTypeCode === t.id)?.overbookRooms ?? 0,
    })),
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireHotelApiSection(url.searchParams.get("slug") ?? "", ["reservations", "frontdesk"]);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ ...(await payload(auth)), canManage: isAdminLikeRole(auth.role) });
}

const PostSchema = z.object({
  slug: z.string().min(1),
  roomTypeCode: z.string().min(1).max(80),
  overbookRooms: z.coerce.number().int().min(0).max(200),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiSection(body.slug, ["reservations", "frontdesk"]);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });
    if (!normalizeRoomTypes(auth.tenant.room_types).some((t) => t.id === body.roomTypeCode)) {
      return NextResponse.json({ error: "That room type wasn't found." }, { status: 400 });
    }

    const result = await saveRoomTypeLimit(auth.service, {
      tenantId: auth.tenant.id,
      roomTypeCode: body.roomTypeCode,
      overbookRooms: body.overbookRooms,
      userId: auth.user.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "overbooking_limit_saved",
      entityType: "tenant",
      entityId: auth.tenant.id,
      after: { roomTypeCode: body.roomTypeCode, overbookRooms: body.overbookRooms },
    });
    return NextResponse.json({ ok: true, ...(await payload(auth)), canManage: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Could not save the limit." }, { status: 500 });
  }
}
