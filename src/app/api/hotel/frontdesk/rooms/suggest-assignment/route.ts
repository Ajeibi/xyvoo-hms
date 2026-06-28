import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { suggestRoomsForReservation } from "@/lib/hms/rooms-ai";

const QuerySchema = z.object({
  slug: z.string().min(1),
  reservationId: z.string().uuid(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      reservationId: url.searchParams.get("reservationId"),
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const suggestions = await suggestRoomsForReservation(
      auth.service,
      auth.tenant.id,
      query.reservationId,
    );

    return NextResponse.json({ suggestions });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to suggest rooms." }, { status: 500 });
  }
}
