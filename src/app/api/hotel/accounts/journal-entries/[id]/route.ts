import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getJournalEntryDetail } from "@/lib/hms/journal-entries";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const detail = await getJournalEntryDetail(auth.service, auth.tenant.id, id);
    if (!detail) return NextResponse.json({ error: "Not found." }, { status: 404 });

    return NextResponse.json(detail);
  } catch (e) {
    console.error("[journal-entries/[id] GET]", e);
    return NextResponse.json({ error: "Failed to load journal entry." }, { status: 500 });
  }
}
