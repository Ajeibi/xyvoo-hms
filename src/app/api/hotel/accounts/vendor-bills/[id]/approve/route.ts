import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { approveVendorBill } from "@/lib/hms/vendor-bills";

const BodySchema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canApproveVendorBill) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const { data: apAccount } = await auth.service
      .schema("hotel")
      .from("chart_of_accounts")
      .select("id")
      .eq("tenant_id", auth.tenant.id)
      .eq("code", "2000")
      .eq("is_active", true)
      .maybeSingle();
    if (!apAccount) {
      return NextResponse.json(
        { error: "No active 'Accounts Payable' account (code 2000) found." },
        { status: 503 },
      );
    }

    const result = await approveVendorBill(auth.service, {
      tenantId: auth.tenant.id,
      billId: id,
      approvedBy: auth.user.id,
      apAccountId: apAccount.id as string,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[vendor-bill approve]", e);
    return NextResponse.json({ error: "Failed to approve bill." }, { status: 500 });
  }
}
