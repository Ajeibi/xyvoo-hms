import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createVendor, listVendors } from "@/lib/hms/procurement-vendors";

const STATUS_VALUES = ["active", "preferred", "inactive", "blacklisted"] as const;

const QuerySchema = z.object({
  slug: z.string().min(1),
  status: z.string().optional(),
  categoryId: z.string().optional(),
  search: z.string().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
      categoryId: url.searchParams.get("categoryId") ?? undefined,
      search: url.searchParams.get("search") ?? undefined,
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const status = query.status
      ?.split(",")
      .map((s) => s.trim())
      .filter((s): s is (typeof STATUS_VALUES)[number] => (STATUS_VALUES as readonly string[]).includes(s));

    const vendors = await listVendors(auth.service, auth.tenant.id, {
      status: status?.length ? status : undefined,
      categoryId: query.categoryId,
      search: query.search,
    });
    return NextResponse.json({ vendors });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1).max(200),
  categoryId: z.string().optional(),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(400).optional(),
  country: z.string().max(80).optional(),
  currency: z.string().max(6).optional(),
  paymentTerms: z.string().max(200).optional(),
  leadTimeDays: z.number().int().min(0).max(365).optional(),
  status: z.enum(STATUS_VALUES).optional(),
  certifications: z.array(z.string().max(80)).max(20).optional(),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { vendor, error } = await createVendor(auth.service, {
      tenantId: auth.tenant.id,
      name: body.name,
      categoryId: body.categoryId,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email || undefined,
      address: body.address,
      country: body.country,
      currency: body.currency,
      paymentTerms: body.paymentTerms,
      leadTimeDays: body.leadTimeDays,
      status: body.status,
      certifications: body.certifications,
      notes: body.notes,
    });
    if (error || !vendor) return NextResponse.json({ error: error ?? "Could not create vendor." }, { status: 400 });
    return NextResponse.json({ vendor });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
