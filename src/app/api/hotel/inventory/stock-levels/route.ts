import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getStockLevels, upsertParReorder } from "@/lib/hms/inventory-stock";

const QuerySchema = z.object({
  slug: z.string().min(1),
  locationId: z.string().optional(),
  itemId: z.string().optional(),
  onlyLowStock: z.enum(["true", "false"]).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      locationId: url.searchParams.get("locationId") ?? undefined,
      itemId: url.searchParams.get("itemId") ?? undefined,
      onlyLowStock: url.searchParams.get("onlyLowStock") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const stockLevels = await getStockLevels(auth.service, auth.tenant.id, {
      locationId: query.locationId,
      itemId: query.itemId,
      onlyLowStock: query.onlyLowStock === "true",
    });
    return NextResponse.json({ stockLevels });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/stock-levels GET]", e);
    return NextResponse.json({ error: "Failed to load stock levels." }, { status: 500 });
  }
}

const PatchSchema = z.object({
  slug: z.string().min(1),
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  parLevel: z.coerce.number().min(0),
  reorderPoint: z.coerce.number().min(0),
  reorderQty: z.coerce.number().min(0),
});

export async function PATCH(req: Request) {
  try {
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await upsertParReorder(auth.service, {
      tenantId: auth.tenant.id,
      itemId: body.itemId,
      locationId: body.locationId,
      parLevel: body.parLevel,
      reorderPoint: body.reorderPoint,
      reorderQty: body.reorderQty,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
