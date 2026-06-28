import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getMaintenanceInsights } from "@/lib/hms/rooms-ai";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const QuerySchema = z.object({
  slug: z.string().min(1),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canBlockRoom && !caps.canLogIncidents) {
      return NextResponse.json({ insights: [] });
    }

    const insights = await getMaintenanceInsights(auth.service, auth.tenant.id);
    return NextResponse.json({ insights });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to load insights." }, { status: 500 });
  }
}
