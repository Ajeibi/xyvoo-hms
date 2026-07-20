import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { deleteCategory, updateCategory } from "@/lib/hms/inventory-items";

const PatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().min(1).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { category, error } = await updateCategory(auth.service, auth.tenant.id, id, {
      name: body.name,
      parentId: body.parentId,
      sortOrder: body.sortOrder,
    });
    if (error || !category) {
      return NextResponse.json({ error: error ?? "Could not update category." }, { status: 400 });
    }

    return NextResponse.json({ category });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const DeleteSchema = z.object({
  slug: z.string().min(1),
});

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const body = DeleteSchema.parse({
      slug: url.searchParams.get("slug"),
    });
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await deleteCategory(auth.service, auth.tenant.id, id);
    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
