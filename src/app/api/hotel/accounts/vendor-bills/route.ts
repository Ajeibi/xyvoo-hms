import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createVendorBill, listVendorBills, VENDOR_BILL_STATUSES } from "@/lib/hms/vendor-bills";
import { ACCOUNTS_DEPARTMENTS } from "@/lib/hms/journal-entries";

const ListQuery = z.object({
  slug: z.string().min(1),
  status: z.enum(VENDOR_BILL_STATUSES).optional(),
});

const PostBody = z.object({
  slug: z.string().min(1),
  vendorId: z.string().uuid(),
  purchaseOrderId: z.string().uuid().optional(),
  department: z.enum(ACCOUNTS_DEPARTMENTS),
  billReference: z.string().max(80).optional(),
  billDate: z.string().min(1),
  dueDate: z.string().optional(),
  currency: z.string().min(1).max(10),
  fxRate: z.number().positive().optional(),
  expenseAccountId: z.string().uuid(),
  subtotal: z.number(),
  tax: z.number().optional(),
  notes: z.string().max(1000).optional(),
});

async function findApAccountId(auth: { service: import("@supabase/supabase-js").SupabaseClient; tenant: { id: string } }) {
  const { data } = await auth.service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", auth.tenant.id)
    .eq("code", "2000")
    .eq("is_active", true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = ListQuery.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const bills = await listVendorBills(auth.service, auth.tenant.id, { status: query.status });
    return NextResponse.json({ bills });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[vendor-bills GET]", e);
    return NextResponse.json({ error: "Failed to load vendor bills." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canCreateVendorBill) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const apAccountId = await findApAccountId(auth);
    if (!apAccountId) {
      return NextResponse.json(
        { error: "No active 'Accounts Payable' account (code 2000) found. Add one in Chart of accounts first." },
        { status: 503 },
      );
    }

    const result = await createVendorBill(auth.service, {
      tenantId: auth.tenant.id,
      vendorId: body.vendorId,
      purchaseOrderId: body.purchaseOrderId ?? null,
      department: body.department,
      billReference: body.billReference ?? null,
      billDate: body.billDate,
      dueDate: body.dueDate ?? null,
      currency: body.currency,
      fxRate: body.fxRate,
      expenseAccountId: body.expenseAccountId,
      apAccountId,
      subtotal: body.subtotal,
      tax: body.tax,
      notes: body.notes ?? null,
      createdBy: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, status: result.status });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[vendor-bills POST]", e);
    return NextResponse.json({ error: "Failed to create vendor bill." }, { status: 500 });
  }
}
