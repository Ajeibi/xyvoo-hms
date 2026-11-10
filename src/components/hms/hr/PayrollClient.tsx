"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Banknote, Download, FileSpreadsheet, Mail, Printer } from "lucide-react";
import { HmsAlert, HmsCard, HmsEmptyState, HmsField, HmsPill, HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { callHr } from "@/components/hms/hr/hr-ui";
import { naira } from "@/lib/hms/hr/hr-shared";
import type { PayRun, Payslip } from "@/lib/hms/hr/hr-payroll";
import type { PayslipSend } from "@/lib/hms/hr/hr-payslip-email";

const STATUS_TONE = { draft: "amber", approved: "blue", paid: "green", void: "slate" } as const;
const STATUS_LABEL = { draft: "Draft", approved: "Approved", paid: "Paid", void: "Void" } as const;

function useSend(slug: string) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const r = await callHr<{ id?: string; warning?: string | null }>("/api/hotel/hr/payroll", "POST", { slug, ...body });
    setBusy(false);
    if (r.error) {
      setError(r.error);
      return null;
    }
    setMessage(r.data?.warning ? `${done} ${r.data.warning}` : done);
    router.refresh();
    return r.data ?? {};
  }
  return { busy, error, message, send, router };
}

export function PayRunsClient({ slug, runs, defaultStart, defaultEnd }: { slug: string; runs: PayRun[]; defaultStart: string; defaultEnd: string }) {
  const { busy, error, message, send, router } = useSend(slug);
  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);
  return (
    <div className="space-y-4">
      <HmsCard title="Start a pay run" icon={Banknote} meaning="money" description="Uses everyone's pay, approved hours and unpaid leave for the period. You can check and change it before approving.">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const d = await send({ action: "create", periodStart: start, periodEnd: end }, "Pay run worked out.");
            if (d?.id) router.push(`/hms/${slug}/hr/payroll/${d.id}`);
          }}
        >
          <HmsField id="pr-start" label="From">
            <input id="pr-start" type="date" required className={hmsInput} value={start} onChange={(e) => setStart(e.target.value)} />
          </HmsField>
          <HmsField id="pr-end" label="To">
            <input id="pr-end" type="date" required className={hmsInput} value={end} onChange={(e) => setEnd(e.target.value)} />
          </HmsField>
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            {busy ? "Working it out…" : "Work out pay"}
          </button>
        </form>
        <div className="mt-2 space-y-1">
          <HmsAlert message={error} />
          {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}
        </div>
      </HmsCard>
      <HmsCard flush title="Pay runs" icon={Banknote} meaning="money">
        {runs.length === 0 ? (
          <HmsEmptyState bare icon={Banknote} meaning="money" title="No pay runs yet" description="Start your first one above." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 text-sm sm:px-6">
                <span>
                  <Link href={`/hms/${slug}/hr/payroll/${r.id}`} className="font-semibold text-slate-900 hover:underline">
                    {r.label}
                  </Link>{" "}
                  <HmsPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</HmsPill>
                </span>
                <span className="tabular-nums text-slate-700">
                  {r.totals ? `${r.totals.people} people · net ${naira(r.totals.netPay)} · cost ${naira(r.totals.employerCost)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>
      <YearEndCard slug={slug} runs={runs} />
    </div>
  );
}

/** Year-end PAYE return (Form H1), due to the state tax office by 31 January. */
function YearEndCard({ slug, runs }: { slug: string; runs: PayRun[] }) {
  const years = [...new Set(runs.filter((r) => r.status === "approved" || r.status === "paid").map((r) => Number(r.periodEnd.slice(0, 4))))].sort((a, b) => b - a);
  if (!years.length) return null;
  const href = (y: number, format: string) => `/api/hotel/hr/payroll/annual?slug=${encodeURIComponent(slug)}&year=${y}&format=${format}`;
  return (
    <HmsCard title="Year-end PAYE return" icon={FileSpreadsheet} meaning="money" description="Pay and PAYE per person for the year, from approved runs, for Form H1. File it with your state tax office by 31 January.">
      <ul className="space-y-2 text-sm">
        {years.map((y) => (
          <li key={y} className="flex flex-wrap items-center gap-2">
            <span className="w-12 font-semibold text-slate-900">{y}</span>
            <a className={hmsButton.small} href={href(y, "xlsx")}>
              <Download className="h-4 w-4" aria-hidden /> Excel
            </a>
            <a className={hmsButton.small} href={href(y, "csv")}>
              <Download className="h-4 w-4" aria-hidden /> CSV
            </a>
          </li>
        ))}
      </ul>
    </HmsCard>
  );
}

export function PayRunClient({ slug, run, slips, today, sends = {} }: { slug: string; run: PayRun; slips: Payslip[]; today: string; sends?: Record<string, PayslipSend> }) {
  const { busy, error, message, send } = useSend(slug);
  const [paidOn, setPaidOn] = useState(today);
  const [voidReason, setVoidReason] = useState("");
  const [oneOff, setOneOff] = useState<{ employeeId: string; amount: string; note: string } | null>(null);
  const t = run.totals;
  const exportHref = (kind: string, format = "csv") => `/api/hotel/hr/payroll/${run.id}/export?slug=${encodeURIComponent(slug)}&kind=${kind}&format=${format}`;

  return (
    <div className="space-y-4">
      {run.warnings.length ? (
        <HmsWarning title="Check before approving">
          <ul className="list-disc pl-4">
            {run.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </HmsWarning>
      ) : null}
      <HmsAlert message={error} />
      {message ? <p role="status" className="text-sm text-emerald-700">{message}</p> : null}

      {t ? (
        <dl className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm sm:grid-cols-4">
          {[
            ["People", String(t.people)],
            ["Gross pay", naira(t.gross)],
            ["PAYE", naira(t.paye)],
            ["Pension (staff + hotel)", naira(t.pensionEmployee + t.pensionEmployer)],
            ["NHF", naira(t.nhf)],
            ["NSITF + ITF", naira(t.nsitf + t.itf)],
            ["Net pay to staff", naira(t.netPay)],
            ["Cost to the hotel", naira(t.employerCost)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-slate-500">{k}</dt>
              <dd className="text-lg font-semibold tabular-nums text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {run.status === "draft" ? (
          <>
            <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void send({ action: "recalculate", id: run.id }, "Worked out again.")}>
              Work it out again
            </button>
            <button type="button" className={hmsButton.primary} disabled={busy || !t?.people} onClick={() => void send({ action: "approve", id: run.id }, "Approved. Payslips are frozen and the payroll is in the books.")}>
              Approve and post to the books
            </button>
          </>
        ) : null}
        {run.status === "approved" ? (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ action: "paid", id: run.id, paidOn }, "Marked as paid and posted from the bank account.");
            }}
          >
            <HmsField id="paid-on" label="Paid on">
              <input id="paid-on" type="date" required className={hmsInput} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </HmsField>
            <button type="submit" className={hmsButton.primary} disabled={busy}>
              Mark salaries paid
            </button>
          </form>
        ) : null}
        {run.status === "approved" || run.status === "paid" ? (
          <button
            type="button"
            className={hmsButton.secondary}
            disabled={busy}
            onClick={() => {
              const already = slips.filter((s) => sends[s.id]).length;
              if (already && !window.confirm(`${already} of ${slips.length} payslips were emailed before. Send everyone's again?`)) return;
              void send({ action: "email_payslips", id: run.id }, "Payslips emailed.");
            }}
          >
            <Mail className="h-4 w-4" aria-hidden /> Email payslips to staff
          </button>
        ) : null}
      </div>

      <HmsCard title="Downloads" icon={Download} meaning="money" description="For the bank, the state tax office, pension administrators and the NHF.">
        <div className="flex flex-wrap gap-2">
          <a className={hmsButton.small} href={exportHref("register", "xlsx")}>
            <FileSpreadsheet className="h-4 w-4" aria-hidden /> Payroll register (Excel)
          </a>
          <a className={hmsButton.small} href={exportHref("bank")}>
            Bank schedule (CSV)
          </a>
          <a className={hmsButton.small} href={exportHref("bank", "xlsx")}>
            Bank schedule (Excel)
          </a>
          <a className={hmsButton.small} href={exportHref("paye")}>
            PAYE schedule (CSV)
          </a>
          <a className={hmsButton.small} href={exportHref("pension")}>
            Pension schedule (CSV)
          </a>
          <a className={hmsButton.small} href={exportHref("nhf")}>
            NHF schedule (CSV)
          </a>
        </div>
      </HmsCard>

      {oneOff ? (
        <HmsCard title="Add a one-off amount" description="A bonus, arrears or 13th month for this run only. It is taxed but not pensionable. Set 0 to remove it.">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await send({ action: "one_off", id: run.id, employeeId: oneOff.employeeId, amount: Number(oneOff.amount) || 0, note: oneOff.note || null }, "Saved and worked out again.")) setOneOff(null);
            }}
          >
            <HmsField id="oo-amt" label="Amount (₦)">
              <input id="oo-amt" type="number" min={0} step="0.01" required className={hmsInput} value={oneOff.amount} onChange={(e) => setOneOff({ ...oneOff, amount: e.target.value })} />
            </HmsField>
            <HmsField id="oo-note" label="What for" optional>
              <input id="oo-note" className={hmsInput} value={oneOff.note} onChange={(e) => setOneOff({ ...oneOff, note: e.target.value })} />
            </HmsField>
            <button type="submit" className={hmsButton.primary} disabled={busy}>
              Save
            </button>
            <button type="button" className={hmsButton.secondary} onClick={() => setOneOff(null)}>
              Cancel
            </button>
          </form>
        </HmsCard>
      ) : null}

      <HmsCard flush title="Payslips" icon={Banknote} meaning="money">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="border-y border-slate-100 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 sm:px-6">Person</th>
                <th className="px-3 py-2 text-right">Gross</th>
                <th className="px-3 py-2 text-right">PAYE</th>
                <th className="px-3 py-2 text-right">Pension</th>
                <th className="px-3 py-2 text-right">NHF</th>
                <th className="px-3 py-2 text-right">Other</th>
                <th className="px-3 py-2 text-right">Net pay</th>
                <th className="px-3 py-2 text-right">Hotel cost</th>
                <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slips.map((s) => (
                <tr key={s.id}>
                  <td className="px-3 py-2 sm:px-6">
                    <span className="font-semibold text-slate-900">{s.snapshot.name}</span>
                    <span className="block text-xs text-slate-500">
                      {s.snapshot.employeeNumber}
                      {s.snapshot.overtimeHours ? ` · ${s.snapshot.overtimeHours}h overtime` : ""}
                      {s.snapshot.unpaidLeaveDays ? ` · ${s.snapshot.unpaidLeaveDays} unpaid days` : ""}
                      {s.result.oneOffAdditions ? ` · one-off ${naira(s.result.oneOffAdditions)}` : ""}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{naira(s.result.gross)}</td>
                  <td className="px-3 py-2 text-right tabular-nums" title={s.result.payeNote ?? undefined}>
                    {naira(s.result.paye)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{naira(s.result.pensionEmployee)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{naira(s.result.nhf)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{naira(s.result.otherDeductions)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{naira(s.result.netPay)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{naira(s.result.employerCost)}</td>
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link className={hmsButton.quiet} href={`/hms/${slug}/hr/payroll/${run.id}/payslip/${s.employeeId}`}>
                      <Printer className="h-3.5 w-3.5" aria-hidden /> Payslip
                    </Link>
                    {run.status === "approved" || run.status === "paid" ? (
                      <button
                        type="button"
                        className={hmsButton.quiet}
                        disabled={busy}
                        title={sends[s.id] ? `Emailed to ${sends[s.id].sentTo} on ${new Date(sends[s.id].sentAt).toLocaleString("en-GB", { timeZone: "Africa/Lagos", dateStyle: "medium", timeStyle: "short" })}` : "Not emailed yet"}
                        onClick={() => void send({ action: "email_payslips", id: run.id, employeeId: s.employeeId }, `Payslip emailed to ${s.snapshot.name}.`)}
                      >
                        <Mail className="h-3.5 w-3.5" aria-hidden /> {sends[s.id] ? "Sent · resend" : "Email"}
                      </button>
                    ) : null}
                    {run.status === "draft" ? (
                      <button type="button" className={hmsButton.quiet} onClick={() => setOneOff({ employeeId: s.employeeId, amount: String(s.result.oneOffAdditions || ""), note: run.oneOffs[s.employeeId]?.note ?? "" })}>
                        One-off
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </HmsCard>

      {run.status === "draft" || run.status === "approved" ? (
        <HmsCard title="Void this pay run" description={run.status === "approved" ? "The payroll journal will be reversed in the books." : "The draft is set aside; you can start a new run for the period."}>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send({ action: "void", id: run.id, reason: voidReason }, "Pay run voided.");
            }}
          >
            <HmsField id="void-why" label="Reason">
              <input id="void-why" required minLength={3} className={hmsInput} value={voidReason} onChange={(e) => setVoidReason(e.target.value)} />
            </HmsField>
            <button type="submit" className={hmsButton.danger} disabled={busy}>
              Void
            </button>
          </form>
        </HmsCard>
      ) : null}
      <p className="text-xs text-slate-500">Worked out with Nigerian payroll rules {run.rulesVersion}. Check the figures with your accountant.</p>
    </div>
  );
}
