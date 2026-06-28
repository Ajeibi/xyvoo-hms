import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getRoomDetail } from "@/lib/hms/rooms-workbench";
import { normalizePricingSetup, normalizeRoomTypes } from "@/lib/hms/room-pricing";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const pricing = normalizePricingSetup(auth.tenant.pricing_setup);
    const roomTypes = normalizeRoomTypes(auth.tenant.room_types);

    const fromBoard = url.searchParams.get("fromBoard") === "1";

    const detail = await getRoomDetail({
      tenantId: auth.tenant.id,
      roomUnitId: id,
      currency: pricing.currency,
      roomTypes,
      fromBoard,
    });

    if (!detail) return NextResponse.json({ error: "Room not found." }, { status: 404 });
    return NextResponse.json(detail);
  } catch (e) {
    console.error("[room detail GET]", e);
    return NextResponse.json({ error: "Failed to load room." }, { status: 500 });
  }
}
