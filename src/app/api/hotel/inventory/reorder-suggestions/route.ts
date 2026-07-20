import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getReorderSuggestions } from "@/lib/hms/inventory-stock";

const QuerySchema = z.object({ slug: z.string().min(1) });

/** Data seam for a future Procurement module — items at/under reorder point, with a suggested reorder qty. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const suggestions = await getReorderSuggestions(auth.service, auth.tenant.id);
    return NextResponse.json({ suggestions });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
