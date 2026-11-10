import { NextResponse } from "next/server";
import { buildCsv, rowsToXlsx } from "@/lib/hms/accounting-exports";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { exportRows, getPayRun, type ExportKind } from "@/lib/hms/hr/hr-payroll";

const KINDS: ExportKind[] = ["register", "bank", "paye", "pension", "nhf"];
const NAMES: Record<ExportKind, string> = { register: "payroll-register", bank: "bank-schedule", paye: "paye-schedule", pension: "pension-schedule", nhf: "nhf-schedule" };

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(req.url);
  const a = await authHr(url.searchParams.get("slug"));
  if (isFailure(a)) return a;
  const kind = (url.searchParams.get("kind") ?? "register") as ExportKind;
  if (!KINDS.includes(kind)) return fail("Unknown export.");
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : "csv";

  // Read through the caller's own client: nothing comes back unless the database lets them see pay.
  const found = await getPayRun(a.privateDb, a.auth.tenant.id, id);
  if (!found) return fail("Pay run not found, or you can't see pay.", 404);
  const rows = exportRows(kind, found.run, found.slips);
  const file = `${NAMES[kind]}-${found.run.periodEnd}`;
  await writeAuditLog({ tenantId: a.auth.tenant.id, actorUserId: a.actor.userId, action: "hr.payrun.exported", entityType: "hr_pay_run", entityId: id, after: { kind, format } });

  const headers = { "Cache-Control": "no-store, private" };
  if (format === "xlsx") {
    const buf = await rowsToXlsx(NAMES[kind], rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: { ...headers, "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${file}.xlsx"` },
    });
  }
  return new NextResponse(buildCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}.csv"` } });
}
