import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getBankReconciliation } from "@/lib/hms/bank-reconciliation";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await getBankReconciliation(auth.service, auth.tenant.id, id);
    if (!result) return NextResponse.json({ error: "Reconciliation not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[bank-reconciliations/[id] GET]", e);
    return NextResponse.json({ error: "Failed to load reconciliation." }, { status: 500 });
  }
}
