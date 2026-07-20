import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getVendorById, updateVendor } from "@/lib/hms/procurement-vendors";

const STATUS_VALUES = ["active", "preferred", "inactive", "blacklisted"] as const;

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const vendor = await getVendorById(auth.service, auth.tenant.id, id);
    if (!vendor) return NextResponse.json({ error: "Vendor not found." }, { status: 404 });
    return NextResponse.json({ vendor });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PatchSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(200).optional(),
  categoryId: z.string().nullable().optional(),
  contactName: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  email: z.string().max(200).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  country: z.string().max(80).nullable().optional(),
  currency: z.string().max(6).optional(),
  paymentTerms: z.string().max(200).nullable().optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  certifications: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { vendor, error } = await updateVendor(auth.service, auth.tenant.id, id, {
      name: body.name,
      categoryId: body.categoryId,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      country: body.country,
      currency: body.currency,
      paymentTerms: body.paymentTerms,
      leadTimeDays: body.leadTimeDays,
      status: body.status,
      certifications: body.certifications,
      notes: body.notes,
    });
    if (error || !vendor) return NextResponse.json({ error: error ?? "Could not update vendor." }, { status: 400 });
    return NextResponse.json({ vendor });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
