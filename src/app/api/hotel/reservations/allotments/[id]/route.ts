import { NextResponse } from "next/server";
import { z } from "zod";
import { requireReservationsApi, todayDay } from "@/lib/hms/reservations-api";
import { addRoomingList, listAllotments, updateAllotment } from "@/lib/hms/reservation-allotments";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

/**
 * POST /api/hotel/reservations/allotments/:id — release the unused rooms now, cancel the allotment,
 * change its release date or room count (managers), or add bookings from a pasted rooming list.
 */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("release"), slug: z.string().min(1) }),
  z.object({ action: z.literal("cancel"), slug: z.string().min(1) }),
  z.object({ action: z.literal("update"), slug: z.string().min(1), releaseDate: day.nullable().optional(), rooms: z.coerce.number().int().min(1).max(500).optional() }),
  z.object({ action: z.literal("rooming_list"), slug: z.string().min(1), text: z.string().min(1, "Add at least one guest.").max(20000) }),
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = Body.parse(await req.json());
    const auth = await requireReservationsApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const today = todayDay();

    if (body.action === "rooming_list") {
      const result = await addRoomingList(auth.service, {
        tenantId: auth.tenant.id,
        userId: auth.user.id,
        allotmentId: id,
        roomTypes: normalizeRoomTypes(auth.tenant.room_types),
        pricing: normalizePricingSetup(auth.tenant.pricing_setup),
        today,
        text: body.text,
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, made: result.made, skipped: result.skipped, allotments: await listAllotments(auth.service, auth.tenant.id, today) });
    }

    if (!auth.caps.canBulkActions) return NextResponse.json({ error: "Only a manager can change an allotment." }, { status: 403 });
    const result = await updateAllotment(auth.service, {
      tenantId: auth.tenant.id,
      userId: auth.user.id,
      id,
      today,
      change: body.action === "update" ? { action: "update", releaseDate: body.releaseDate, rooms: body.rooms } : { action: body.action },
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, allotments: await listAllotments(auth.service, auth.tenant.id, today) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    console.error("[allotments change]", e);
    return NextResponse.json({ error: "Could not change the allotment." }, { status: 500 });
  }
}
