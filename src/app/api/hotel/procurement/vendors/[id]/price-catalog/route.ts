import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { addVendorPriceCatalogEntry, listVendorPriceCatalog } from "@/lib/hms/procurement-vendors";

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const entries = await listVendorPriceCatalog(auth.service, auth.tenant.id, id);
    return NextResponse.json({ entries });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  itemId: z.string().min(1),
  unitPrice: z.coerce.number().min(0),
  currency: z.string().max(6).optional(),
  moq: z.coerce.number().min(0).optional(),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { entry, error } = await addVendorPriceCatalogEntry(auth.service, {
      tenantId: auth.tenant.id,
      vendorId: id,
      itemId: body.itemId,
      unitPrice: body.unitPrice,
      currency: body.currency,
      moq: body.moq,
      validFrom: body.validFrom,
      validTo: body.validTo,
    });
    if (error || !entry) return NextResponse.json({ error: error ?? "Could not save price catalog entry." }, { status: 400 });
    return NextResponse.json({ entry });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
