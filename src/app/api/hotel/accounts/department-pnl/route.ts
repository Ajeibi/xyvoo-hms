import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getDepartmentPnl } from "@/lib/hms/department-pnl";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const dateFrom = url.searchParams.get("dateFrom");
    const dateTo = url.searchParams.get("dateTo");
    if (!slug || !dateFrom || !dateTo || !DATE.test(dateFrom) || !DATE.test(dateTo)) {
      return NextResponse.json({ error: "slug, dateFrom and dateTo are required." }, { status: 400 });
    }
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    return NextResponse.json(await getDepartmentPnl(auth.service, auth.tenant.id, { dateFrom, dateTo }));
  } catch (e) {
    console.error("[department-pnl GET]", e);
    return NextResponse.json({ error: "Failed to load the department report." }, { status: 500 });
  }
}
