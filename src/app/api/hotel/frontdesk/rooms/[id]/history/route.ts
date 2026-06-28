import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getRoomHistory } from "@/lib/hms/rooms-workbench";

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

    const history = await getRoomHistory({ tenantId: auth.tenant.id, roomUnitId: id });
    return NextResponse.json(history);
  } catch (e) {
    console.error("[room history GET]", e);
    return NextResponse.json({ error: "Failed to load history." }, { status: 500 });
  }
}
