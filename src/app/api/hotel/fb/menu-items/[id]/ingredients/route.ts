import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { listIngredientsForMenuItem, setIngredientsForMenuItem } from "@/lib/hms/fb-menu-ingredients";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const ingredients = await listIngredientsForMenuItem(auth.service, auth.tenant.id, id);
    return NextResponse.json({ ingredients });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PutSchema = z.object({
  slug: z.string().min(1),
  ingredients: z.array(
    z.object({
      inventoryItemId: z.string().min(1),
      qtyPerServing: z.number().positive(),
    }),
  ),
});

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PutSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const result = await setIngredientsForMenuItem(
      auth.service,
      auth.tenant.id,
      id,
      body.ingredients.map((i) => ({ inventoryItemId: i.inventoryItemId, qtyPerServing: i.qtyPerServing })),
    );
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
