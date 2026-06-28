import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getRoomsWorkbenchData, type RoomsWorkbenchFilters } from "@/lib/hms/rooms-workbench";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

const QuerySchema = z.object({
  slug: z.string().min(1),
  q: z.string().max(120).optional(),
  floor: z.coerce.number().optional(),
  roomType: z.string().optional(),
  displayStatus: z.string().optional(),
  vipOnly: z.enum(["true", "false"]).optional(),
  occupied: z.enum(["true", "false"]).optional(),
  priorityCleanOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      q: url.searchParams.get("q") ?? undefined,
      floor: url.searchParams.get("floor") ?? undefined,
      roomType: url.searchParams.get("roomType") ?? undefined,
      displayStatus: url.searchParams.get("displayStatus") ?? undefined,
      vipOnly: url.searchParams.get("vipOnly") ?? undefined,
      occupied: url.searchParams.get("occupied") ?? undefined,
      priorityCleanOnly: url.searchParams.get("priorityCleanOnly") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
    const roomTypes = normalizeRoomTypes(auth.tenant.room_types);
    const filters: RoomsWorkbenchFilters = {};
    if (query.q?.trim()) filters.q = query.q.trim();
    if (query.floor != null && !Number.isNaN(query.floor)) filters.floor = query.floor;
    if (query.roomType) filters.roomType = query.roomType;
    if (query.displayStatus) filters.displayStatus = query.displayStatus;
    if (query.vipOnly === "true") filters.vipOnly = true;
    if (query.occupied === "true") filters.occupied = true;
    if (query.priorityCleanOnly === "true") filters.priorityCleanOnly = true;

    const payload = await getRoomsWorkbenchData({
      tenantId: auth.tenant.id,
      slug: query.slug,
      currency: pricing.currency,
      floorPlanRaw: auth.tenant.floor_plan,
      roomTypes,
      filters,
    });

    return NextResponse.json(payload);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[rooms GET]", e);
    return NextResponse.json({ error: "Failed to load rooms." }, { status: 500 });
  }
}
