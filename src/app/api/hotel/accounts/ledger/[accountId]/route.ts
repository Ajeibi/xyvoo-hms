import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getAccountLedger } from "@/lib/hms/financial-statements";

export async function GET(req: Request, { params }: { params: Promise<{ accountId: string }> }) {
  try {
    const { accountId } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const dateFrom = url.searchParams.get("dateFrom") ?? undefined;
    const dateTo = url.searchParams.get("dateTo") ?? undefined;

    const result = await getAccountLedger(auth.service, auth.tenant.id, accountId, { dateFrom, dateTo });
    if (!result) return NextResponse.json({ error: "Account not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[ledger GET]", e);
    return NextResponse.json({ error: "Failed to load account ledger." }, { status: 500 });
  }
}
