import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createVendorCategory, listVendorCategories } from "@/lib/hms/procurement-vendors";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const categories = await listVendorCategories(auth.service, auth.tenant.id);
    return NextResponse.json({ categories });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PostSchema = z.object({ slug: z.string().min(1), name: z.string().min(1).max(120), sortOrder: z.number().int().optional() });

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { category, error } = await createVendorCategory(auth.service, {
      tenantId: auth.tenant.id,
      name: body.name,
      sortOrder: body.sortOrder,
    });
    if (error || !category) return NextResponse.json({ error: error ?? "Could not create category." }, { status: 400 });
    return NextResponse.json({ category });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
