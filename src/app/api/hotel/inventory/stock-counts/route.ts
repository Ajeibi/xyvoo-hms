import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createStockCount, listStockCounts } from "@/lib/hms/inventory-counts";

const COUNT_STATUSES = ["draft", "in_progress", "completed", "posted"] as const;

const QuerySchema = z.object({
  slug: z.string().min(1),
  status: z.enum(COUNT_STATUSES).optional(),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  locationId: z.string().min(1),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const counts = await listStockCounts(auth.service, auth.tenant.id, {
      status: query.status ? [query.status] : undefined,
    });
    return NextResponse.json({ counts });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory stock-counts GET]", e);
    return NextResponse.json({ error: "Failed to load stock counts." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { count, error } = await createStockCount(auth.service, {
      tenantId: auth.tenant.id,
      locationId: body.locationId,
      startedBy: auth.user.id,
      notes: body.notes,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ count });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
