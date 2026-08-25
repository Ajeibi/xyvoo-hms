import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createSupplier, listSuppliers } from "@/lib/hms/inventory-items";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const suppliers = await listSuppliers(auth.service, auth.tenant.id);
    return NextResponse.json({ suppliers });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/suppliers GET]", e);
    return NextResponse.json({ error: "Failed to load suppliers." }, { status: 500 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(200),
  contactName: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { supplier, error } = await createSupplier(auth.service, {
      tenantId: auth.tenant.id,
      name: body.name,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      notes: body.notes,
    });
    if (error || !supplier) {
      return NextResponse.json({ error: error ?? "Could not create supplier." }, { status: 400 });
    }

    return NextResponse.json({ supplier });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
