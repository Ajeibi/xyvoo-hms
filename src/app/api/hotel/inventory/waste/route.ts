import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getRecentMovements, recordWaste } from "@/lib/hms/inventory-stock";

const QuerySchema = z.object({
  slug: z.string().min(1),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  qty: z.coerce.number().positive(),
  reason: z.string().min(1).max(500),
  note: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const movements = await getRecentMovements(auth.service, auth.tenant.id, {
      movementType: "waste",
      limit: query.limit ?? 100,
    });
    return NextResponse.json({ movements });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory waste GET]", e);
    return NextResponse.json({ error: "Failed to load waste log." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error, movement, qtyOnHand } = await recordWaste(auth.service, {
      tenantId: auth.tenant.id,
      itemId: body.itemId,
      locationId: body.locationId,
      qty: body.qty,
      reason: body.reason,
      performedBy: auth.user.id,
      note: body.note,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ movement, qtyOnHand });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
