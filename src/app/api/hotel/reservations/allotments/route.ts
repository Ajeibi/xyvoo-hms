import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationsApi, todayDay } from "@/lib/hms/reservations-api";
import { createAllotment, listAllotments } from "@/lib/hms/reservation-allotments";
import { normalizeRoomTypes } from "@/lib/hms/room-pricing";

/** GET — the hotel's allotments with what each has picked up. POST — hold rooms for a group (managers). */

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireReservationsApi(url.searchParams.get("slug") ?? "");
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json({ allotments: await listAllotments(auth.service, auth.tenant.id, todayDay()), canManage: auth.caps.canBulkActions });
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date.");
const Post = z.object({
  slug: z.string().min(1),
  name: z.string().trim().min(1, "Give the allotment a name.").max(120),
  contactName: z.string().max(120).nullable().optional(),
  contactPhone: z.string().max(40).nullable().optional(),
  contactEmail: z.union([z.string().email("Enter a valid email address."), z.literal("")]).nullable().optional(),
  roomTypeCode: z.string().min(1, "Choose a room type."),
  rooms: z.coerce.number().int().min(1, "Hold at least one room.").max(500),
  startDate: day,
  endDate: day,
  releaseDate: day.nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = Post.parse(await req.json());
    const auth = await requireReservationsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!auth.caps.canBulkActions) return NextResponse.json({ error: "Only a manager can hold rooms for a group." }, { status: 403 });
    const result = await createAllotment(auth.service, {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      roomTypes: normalizeRoomTypes(auth.tenant.room_types),
      today: todayDay(),
      input: body,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, allotments: await listAllotments(auth.service, auth.tenant.id, todayDay()) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    console.error("[allotments create]", e);
    return NextResponse.json({ error: "Could not hold the rooms." }, { status: 500 });
  }
}
