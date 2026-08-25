import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createCustomerInvoice, CUSTOMER_INVOICE_STATUSES, listCustomerInvoices } from "@/lib/hms/customer-invoices";
import { ACCOUNTS_DEPARTMENTS } from "@/lib/hms/journal-entries";

const ListQuery = z.object({
  slug: z.string().min(1),
  status: z.enum(CUSTOMER_INVOICE_STATUSES).optional(),
});

const PostBody = z.object({
  slug: z.string().min(1),
  customerId: z.string().uuid(),
  reservationId: z.string().uuid().optional(),
  department: z.enum(ACCOUNTS_DEPARTMENTS),
  invoiceDate: z.string().min(1),
  dueDate: z.string().optional(),
  currency: z.string().min(1).max(10),
  revenueAccountId: z.string().uuid(),
  subtotal: z.number(),
  tax: z.number().optional(),
  notes: z.string().max(1000).optional(),
});

async function findArAccountId(
  auth: { service: import("@supabase/supabase-js").SupabaseClient; tenant: { id: string } },
  linkedToReservation: boolean,
) {
  const code = linkedToReservation ? "1300" : "1100";
  const { data } = await auth.service
    .schema("hotel")
    .from("chart_of_accounts")
    .select("id")
    .eq("tenant_id", auth.tenant.id)
    .eq("code", code)
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

    const invoices = await listCustomerInvoices(auth.service, auth.tenant.id, { status: query.status });
    return NextResponse.json({ invoices });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[customer-invoices GET]", e);
    return NextResponse.json({ error: "Failed to load customer invoices." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canCreateCustomerInvoice) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const arAccountId = await findArAccountId(auth, Boolean(body.reservationId));
    if (!arAccountId) {
      const wanted = body.reservationId ? "'City Ledger' (code 1300)" : "'Accounts Receivable' (code 1100)";
      return NextResponse.json({ error: `No active ${wanted} account found. Add one in Chart of accounts first.` }, { status: 503 });
    }

    const result = await createCustomerInvoice(auth.service, {
      tenantId: auth.tenant.id,
      customerId: body.customerId,
      reservationId: body.reservationId ?? null,
      department: body.department,
      invoiceDate: body.invoiceDate,
      dueDate: body.dueDate ?? null,
      currency: body.currency,
      revenueAccountId: body.revenueAccountId,
      arAccountId,
      subtotal: body.subtotal,
      tax: body.tax,
      notes: body.notes ?? null,
      createdBy: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, invoiceNumber: result.invoiceNumber });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[customer-invoices POST]", e);
    return NextResponse.json({ error: "Failed to create invoice." }, { status: 500 });
  }
}
