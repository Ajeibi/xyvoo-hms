import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createPaymentRun, listPaymentRuns } from "@/lib/hms/vendor-bill-payments";

const PostBody = z.object({
  slug: z.string().min(1),
  paymentDate: z.string().min(1),
  bankAccountId: z.string().uuid(),
  reference: z.string().max(80).optional(),
  billIds: z.array(z.string().uuid()).min(1),
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
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const payments = await listPaymentRuns(auth.service, auth.tenant.id);
    return NextResponse.json({ payments });
  } catch (e) {
    console.error("[vendor-bill-payments GET]", e);
    return NextResponse.json({ error: "Failed to load payment runs." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canRecordPayment) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const apAccountId = await findApAccountId(auth);
    if (!apAccountId) {
      return NextResponse.json(
        { error: "No active 'Accounts Payable' account (code 2000) found." },
        { status: 503 },
      );
    }

    const result = await createPaymentRun(auth.service, {
      tenantId: auth.tenant.id,
      paymentDate: body.paymentDate,
      bankAccountId: body.bankAccountId,
      apAccountId,
      reference: body.reference ?? null,
      billIds: body.billIds,
      createdBy: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error, paidBillIds: result.paidBillIds }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, paidBillIds: result.paidBillIds });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[vendor-bill-payments POST]", e);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
}
