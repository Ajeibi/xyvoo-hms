import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createLocation, listLocations } from "@/lib/hms/inventory-items";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const locations = await listLocations(auth.service, auth.tenant.id);
    return NextResponse.json({ locations });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/locations GET]", e);
    return NextResponse.json({ error: "Failed to load store locations." }, { status: 500 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(120),
  locationTypeId: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { location, error } = await createLocation(auth.service, {
      tenantId: auth.tenant.id,
      name: body.name,
      locationTypeId: body.locationTypeId,
    });
    if (error || !location) {
      return NextResponse.json({ error: error ?? "Could not create store location." }, { status: 400 });
    }

    return NextResponse.json({ location });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
