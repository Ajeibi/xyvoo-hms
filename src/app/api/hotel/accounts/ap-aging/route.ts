import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getApAgingReport } from "@/lib/hms/vendor-bill-payments";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const rows = await getApAgingReport(auth.service, auth.tenant.id);
    return NextResponse.json({ rows });
  } catch (e) {
    console.error("[ap-aging GET]", e);
    return NextResponse.json({ error: "Failed to load AP aging report." }, { status: 500 });
  }
}
