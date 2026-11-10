import type { Metadata } from "next";
import { notFound } from "next/navigation";
import HMSLayout from "@/components/hms/HMSLayout";
import { PrintButton } from "@/components/hms/hr/PrintButton";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getPayRun } from "@/lib/hms/hr/hr-payroll";
import { loadHrPage } from "@/lib/hms/hr/hr-page";
import { naira } from "@/lib/hms/hr/hr-shared";

export const metadata: Metadata = { title: "Payslip", robots: { index: false, follow: false } };

export default async function PayslipPage({ params }: { params: Promise<{ slug: string; id: string; employeeId: string }> }) {
  const { slug, id, employeeId } = await params;
  const ctx = await loadHrPage(slug);
  if (!ctx || !ctx.canSeePrivate) notFound();
  const [found, tenant] = await Promise.all([getPayRun(ctx.privateDb, ctx.tenantId, id), getHotelTenantBySlug(slug)]);
  const slip = found?.slips.find((s) => s.employeeId === employeeId);
  if (!found || !slip) notFound();
  const r = slip.result;
  const s = slip.snapshot;
  const hotel = (tenant as { display_name?: string | null; name?: string | null } | null)?.display_name || tenant?.name || "";

  const earnings: [string, number][] = [
    ["Basic salary", r.basic],
    ["Housing allowance", r.housing],
    ["Transport allowance", r.transport],
    ["Other allowances", r.otherAllowances],
    [`Hourly pay (${s.regularHours}h)`, r.hourlyPay],
    [`Daily pay (${s.daysWorked} days)`, r.dailyPay],
    [`Overtime (${s.overtimeHours}h)`, r.overtimePay],
    ["One-off payment", r.oneOffAdditions],
  ];
  const deductions: [string, number][] = [
    ["PAYE tax", r.paye],
    ["Pension (8%)", r.pensionEmployee],
    ["National Housing Fund (2.5%)", r.nhf],
    ["Other deductions", r.otherDeductions],
  ];
  const row = ([k, v]: [string, number]) =>
    v ? (
      <tr key={k}>
        <td className="py-1 pr-4 text-slate-700">{k}</td>
        <td className="py-1 text-right tabular-nums">{naira(v)}</td>
      </tr>
    ) : null;

  return (
    <HMSLayout slug={slug} requiredSection="hr">
      <div className="mx-auto max-w-2xl space-y-4 bg-white p-6 print:p-0">
        <div className="flex items-start justify-between gap-4 print:hidden">
          <a href={`/hms/${slug}/hr/payroll/${id}`} className="text-sm font-medium text-blue-700 underline">
            Back to the pay run
          </a>
          <PrintButton />
        </div>
        <header className="border-b border-slate-200 pb-3">
          <p className="text-sm uppercase tracking-wide text-slate-500">{hotel}</p>
          <h1 className="text-2xl font-semibold text-slate-900">Payslip · {found.run.label}</h1>
          <p className="text-sm text-slate-600">
            {s.name} · {s.employeeNumber}
            {s.jobTitle ? ` · ${s.jobTitle}` : ""}
            {s.department ? ` · ${s.department}` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {s.tin ? `TIN ${s.tin} · ` : ""}
            {s.pfaName ? `${s.pfaName} ` : ""}
            {s.rsaPin ? `RSA ${s.rsaPin} · ` : ""}
            {s.bankName ? `Paid to ${s.bankName} ${s.bankAccountNumber ? `••••${s.bankAccountNumber.slice(-4)}` : ""}` : ""}
          </p>
        </header>
        <div className="grid gap-6 sm:grid-cols-2">
          <table className="w-full text-sm">
            <caption className="mb-1 text-left font-semibold text-slate-900">Earnings</caption>
            <tbody>
              {earnings.map(row)}
              <tr className="border-t border-slate-200 font-semibold">
                <td className="py-1">Gross pay</td>
                <td className="py-1 text-right tabular-nums">{naira(r.gross)}</td>
              </tr>
            </tbody>
            {r.unpaidLeaveDeduction ? (
              <tfoot>
                <tr>
                  <td colSpan={2} className="pt-1 text-xs text-slate-600">
                    Salary and allowances above are after {s.unpaidLeaveDays} unpaid day{s.unpaidLeaveDays === 1 ? "" : "s"} ({naira(r.unpaidLeaveDeduction)}).
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
          <table className="w-full text-sm">
            <caption className="mb-1 text-left font-semibold text-slate-900">Deductions</caption>
            <tbody>
              {deductions.map(row)}
              <tr className="border-t border-slate-200 font-semibold">
                <td className="py-1">Total deductions</td>
                <td className="py-1 text-right tabular-nums">{naira(r.paye + r.pensionEmployee + r.nhf + r.otherDeductions)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-lg font-semibold text-slate-900">Take-home pay: {naira(r.netPay)}</p>
        <div className="text-xs text-slate-600">
          <p>
            Paid by the hotel on top: pension {naira(r.pensionEmployer)}
            {r.nsitf ? `, NSITF ${naira(r.nsitf)}` : ""}
            {r.itf ? `, ITF ${naira(r.itf)}` : ""}.
          </p>
          <p>
            Tax worked out on {naira(r.taxableIncomeAnnual)} a year of taxable income
            {r.reliefs.rent ? `, after rent relief of ${naira(r.reliefs.rent)}` : ""}
            {r.reliefs.cra ? `, after consolidated relief of ${naira(r.reliefs.cra)}` : ""}.{r.payeNote ? ` ${r.payeNote}` : ""}
          </p>
        </div>
      </div>
    </HMSLayout>
  );
}
