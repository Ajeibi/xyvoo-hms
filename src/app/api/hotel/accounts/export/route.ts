import { NextResponse } from "next/server";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { getTrialBalance } from "@/lib/hms/journal-entries";
import {
  buildCsv,
  EXPORT_FORMATS_BY_TYPE,
  getJournalLinesForExport,
  journalRows,
  quickbooksRows,
  rowsToXlsx,
  sageRows,
  trialBalanceRows,
  type ExportFormat,
  type ExportType,
} from "@/lib/hms/accounting-exports";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const type = url.searchParams.get("type") as ExportType | null;
    const format = url.searchParams.get("format") as ExportFormat | null;
    if (!slug || !type || !format) return NextResponse.json({ error: "slug, type and format are required." }, { status: 400 });
    if (!(type in EXPORT_FORMATS_BY_TYPE) || !EXPORT_FORMATS_BY_TYPE[type].includes(format)) {
      return NextResponse.json({ error: "That export is not available." }, { status: 400 });
    }

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    let rows;
    let name: string;
    if (type === "trial-balance") {
      const asOf = url.searchParams.get("asOfDate") ?? undefined;
      if (asOf && !DATE.test(asOf)) return NextResponse.json({ error: "Pick a date." }, { status: 400 });
      rows = trialBalanceRows(await getTrialBalance(auth.service, auth.tenant.id, { asOfDate: asOf }));
      name = `trial-balance-${asOf ?? "to-date"}`;
    } else {
      const dateFrom = url.searchParams.get("dateFrom");
      const dateTo = url.searchParams.get("dateTo");
      if (!dateFrom || !dateTo || !DATE.test(dateFrom) || !DATE.test(dateTo)) {
        return NextResponse.json({ error: "dateFrom and dateTo are required." }, { status: 400 });
      }
      const lines = await getJournalLinesForExport(auth.service, auth.tenant.id, { dateFrom, dateTo });
      rows = format === "quickbooks" ? quickbooksRows(lines) : format === "sage" ? sageRows(lines) : journalRows(lines);
      name = `journal-${dateFrom}-to-${dateTo}${format === "quickbooks" || format === "sage" ? `-${format}` : ""}`;
    }

    if (format === "xlsx") {
      const body = await rowsToXlsx(type === "journal" ? "Journal" : "Trial balance", rows);
      return new NextResponse(new Uint8Array(body), {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${name}.xlsx"`,
        },
      });
    }
    return new NextResponse(buildCsv(rows), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` },
    });
  } catch (e) {
    console.error("[accounts export GET]", e);
    return NextResponse.json({ error: "Failed to build the export." }, { status: 500 });
  }
}
