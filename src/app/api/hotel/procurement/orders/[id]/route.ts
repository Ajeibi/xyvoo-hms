import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getPurchaseOrderById } from "@/lib/hms/procurement-orders";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const order = await getPurchaseOrderById(auth.service, auth.tenant.id, id);
    if (!order) return NextResponse.json({ error: "Purchase order not found." }, { status: 404 });
    return NextResponse.json({ order });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
