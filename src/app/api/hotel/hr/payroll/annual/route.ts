import { NextResponse } from "next/server";
import { buildCsv, rowsToXlsx } from "@/lib/hms/accounting-exports";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { authHr, canSeeHrPrivate, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { annualReturnRows } from "@/lib/hms/hr/hr-payroll";

/** Year-end PAYE return (Form H1): pay and tax per person for a calendar year. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = await authHr(url.searchParams.get("slug"));
  if (isFailure(a)) return a;
  const year = Number.parseInt(url.searchParams.get("year") ?? "", 10);
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return fail("Choose a year.");
  if (!(await canSeeHrPrivate(a.privateDb, a.auth.tenant.id))) return fail("You can't see pay.", 404);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";
  const { rows, runs } = await annualReturnRows(a.privateDb, a.auth.tenant.id, year);
  if (!runs) return fail(`There are no approved pay runs in ${year}.`, 404);
  await writeAuditLog({ tenantId: a.auth.tenant.id, actorUserId: a.actor.userId, action: "hr.payroll.annual_return_exported", entityType: "hr_pay_run", entityId: null, after: { year, format } });

  const file = `paye-annual-return-${year}`;
  const headers = { "Cache-Control": "no-store, private" };
  if (format === "xlsx") {
    const buf = await rowsToXlsx(`PAYE ${year}`, rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${file}.xlsx"` },
    });
  }
  return new NextResponse(buildCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` } });
}
