import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createBankReconciliation, listBankReconciliations } from "@/lib/hms/bank-reconciliation";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const accountId = url.searchParams.get("accountId");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const reconciliations = await listBankReconciliations(auth.service, auth.tenant.id, accountId);
    return NextResponse.json({ reconciliations });
  } catch (e) {
    console.error("[bank-reconciliations GET]", e);
    return NextResponse.json({ error: "Failed to load reconciliations." }, { status: 500 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  accountId: z.string().uuid(),
  periodEndDate: z.string().min(1),
  statementEndingBalance: z.coerce.number(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canReconcileBankAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await createBankReconciliation(auth.service, {
      tenantId: auth.tenant.id,
      accountId: body.accountId,
      periodEndDate: body.periodEndDate,
      statementEndingBalance: body.statementEndingBalance,
      createdBy: auth.user.id,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[bank-reconciliations POST]", e);
    return NextResponse.json({ error: "Failed to create reconciliation." }, { status: 500 });
  }
}
