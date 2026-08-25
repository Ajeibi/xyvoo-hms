import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createArCustomer, listArCustomers } from "@/lib/hms/ar-customers";

const PostBody = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  contactName: z.string().max(120).optional(),
  phone: z.string().max(40).optional(),
  email: z.string().email().optional().or(z.literal("")),
  address: z.string().max(500).optional(),
  currency: z.string().max(10).optional(),
  paymentTerms: z.string().max(60).optional(),
  creditLimit: z.number().nonnegative().optional(),
  notes: z.string().max(1000).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const customers = await listArCustomers(auth.service, auth.tenant.id);
    return NextResponse.json({ customers });
  } catch (e) {
    console.error("[ar customers GET]", e);
    return NextResponse.json({ error: "Failed to load customers." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageArCustomers) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await createArCustomer(auth.service, {
      tenantId: auth.tenant.id,
      name: body.name,
      contactName: body.contactName ?? null,
      phone: body.phone ?? null,
      email: body.email || null,
      address: body.address ?? null,
      currency: body.currency,
      paymentTerms: body.paymentTerms ?? null,
      creditLimit: body.creditLimit ?? null,
      notes: body.notes ?? null,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[ar customers POST]", e);
    return NextResponse.json({ error: "Failed to create customer." }, { status: 500 });
  }
}
