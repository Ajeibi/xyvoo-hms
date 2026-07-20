import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createItem, listItems } from "@/lib/hms/inventory-items";

const QuerySchema = z.object({
  slug: z.string().min(1),
  categoryId: z.string().min(1).optional(),
  search: z.string().max(120).optional(),
  activeOnly: z.enum(["true", "false"]).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      categoryId: url.searchParams.get("categoryId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
      activeOnly: url.searchParams.get("activeOnly") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const items = await listItems(auth.service, auth.tenant.id, {
      categoryId: query.categoryId,
      search: query.search,
      activeOnly: query.activeOnly === "true",
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/items GET]", e);
    return NextResponse.json({ error: "Failed to load items." }, { status: 500 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  sku: z.string().min(1).max(60),
  name: z.string().min(1).max(200),
  categoryId: z.string().min(1).nullable().optional(),
  unitOfMeasureId: z.string().min(1),
  itemTypeId: z.string().min(1),
  unitCost: z.coerce.number().min(0).optional(),
  barcode: z.string().max(80).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { item, error } = await createItem(auth.service, {
      tenantId: auth.tenant.id,
      sku: body.sku,
      name: body.name,
      categoryId: body.categoryId ?? null,
      unitOfMeasureId: body.unitOfMeasureId,
      itemTypeId: body.itemTypeId,
      unitCost: body.unitCost,
      barcode: body.barcode ?? null,
    });
    if (error || !item) {
      return NextResponse.json({ error: error ?? "Could not create item." }, { status: 400 });
    }

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
