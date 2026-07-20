import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createLocationType, listLocationTypes } from "@/lib/hms/inventory-items";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const locationTypes = await listLocationTypes(auth.service, auth.tenant.id);
    return NextResponse.json({ locationTypes });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/location-types GET]", e);
    return NextResponse.json({ error: "Failed to load store location types." }, { status: 500 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(60),
  code: z.string().min(1).max(40).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { row, error } = await createLocationType(auth.service, {
      tenantId: auth.tenant.id,
      name: body.name,
      code: body.code,
      sortOrder: body.sortOrder,
    });
    if (error || !row) {
      return NextResponse.json({ error: error ?? "Could not create store location type." }, { status: 400 });
    }

    return NextResponse.json({ locationType: row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
