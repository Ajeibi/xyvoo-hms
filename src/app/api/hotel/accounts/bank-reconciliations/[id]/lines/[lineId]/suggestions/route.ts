import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getSuggestedMatches } from "@/lib/hms/bank-reconciliation";

export async function GET(req: Request, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const { lineId } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await getSuggestedMatches(auth.service, auth.tenant.id, lineId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ candidates: result.candidates });
  } catch (e) {
    console.error("[.../suggestions GET]", e);
    return NextResponse.json({ error: "Failed to load suggested matches." }, { status: 500 });
  }
}
