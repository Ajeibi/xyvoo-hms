import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { deleteSupplier, updateSupplier } from "@/lib/hms/inventory-items";

const PatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  contactName: z.string().max(200).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { supplier, error } = await updateSupplier(auth.service, auth.tenant.id, id, {
      name: body.name,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
      isActive: body.isActive,
    });
    if (error || !supplier) {
      return NextResponse.json({ error: error ?? "Could not update supplier." }, { status: 400 });
    }

    return NextResponse.json({ supplier });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const DeleteSchema = z.object({ slug: z.string().min(1) });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const body = DeleteSchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await deleteSupplier(auth.service, auth.tenant.id, id);
    if (error) return NextResponse.json({ error }, { status: 400 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
