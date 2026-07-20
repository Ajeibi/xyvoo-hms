import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { updateItem } from "@/lib/hms/inventory-items";

const PatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  unitOfMeasureId: z.string().min(1).optional(),
  itemTypeId: z.string().min(1).optional(),
  unitCost: z.coerce.number().min(0).optional(),
  barcode: z.string().max(80).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { item, error } = await updateItem(auth.service, auth.tenant.id, id, {
      name: body.name,
      categoryId: body.categoryId,
      unitOfMeasureId: body.unitOfMeasureId,
      itemTypeId: body.itemTypeId,
      unitCost: body.unitCost,
      barcode: body.barcode,
      isActive: body.isActive,
    });
    if (error || !item) {
      return NextResponse.json({ error: error ?? "Could not update item." }, { status: 400 });
    }

    return NextResponse.json({ item });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
