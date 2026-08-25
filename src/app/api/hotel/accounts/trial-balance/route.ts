import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getTrialBalance } from "@/lib/hms/journal-entries";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const asOfDate = url.searchParams.get("asOfDate") ?? undefined;
    const rows = await getTrialBalance(auth.service, auth.tenant.id, { asOfDate });
    return NextResponse.json({ rows });
  } catch (e) {
    console.error("[trial-balance GET]", e);
    return NextResponse.json({ error: "Failed to load trial balance." }, { status: 500 });
  }
}
