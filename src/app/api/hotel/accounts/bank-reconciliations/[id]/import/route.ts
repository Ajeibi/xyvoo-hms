import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { parseBankStatementCsv } from "@/lib/hms/bank-statement-import";
import { importStatementLines } from "@/lib/hms/bank-reconciliation";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const formData = await req.formData();
    const slug = String(formData.get("slug") || "");
    const file = formData.get("file");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canReconcileBankAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ error: "Please choose a CSV file to import." }, { status: 400 });
    }

    const text = await file.text();
    const parsed = parseBankStatementCsv(text);
    if (parsed.rows.length === 0) {
      return NextResponse.json(
        {
          error:
            parsed.skipped.length > 0
              ? "We couldn't import any lines from that file — every row is missing a readable date or amount."
              : "That file doesn't have any statement lines in it.",
        },
        { status: 400 },
      );
    }

    const result = await importStatementLines(auth.service, { tenantId: auth.tenant.id, reconciliationId: id, rows: parsed.rows });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, inserted: result.inserted, duplicates: result.duplicates, skipped: parsed.skipped });
  } catch (e) {
    console.error("[bank-reconciliations/[id]/import POST]", e);
    return NextResponse.json({ error: "Failed to import statement." }, { status: 500 });
  }
}
