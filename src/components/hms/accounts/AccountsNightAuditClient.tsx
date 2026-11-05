"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  BedDouble,
  BookUser,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleAlert,
  CircleHelp,
  CreditCard,
  History,
  ListChecks,
  Landmark,
  Moon,
  Shapes,
  UtensilsCrossed,
} from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { NightAuditBreakdown, NightAuditRunRow } from "@/lib/hms/night-audit";
import type { AuditCheck } from "@/lib/hms/night-audit-checks";
import type { AuditReport } from "@/lib/hms/night-audit-report";
import type { NightAuditSettings } from "@/lib/hms/night-audit-settings-shared";
import type { BusinessDateInfo } from "@/lib/hms/business-date";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { NightAuditReportView } from "@/components/hms/accounts/NightAuditReportView";
import { NightAuditSettingsCard } from "@/components/hms/accounts/NightAuditSettingsCard";
import {
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsPage,
  HmsPageHeader,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";

function fmt(n: number) {
  return n.toFixed(2);
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

type Preview = { breakdown: NightAuditBreakdown; checks: { checks: AuditCheck[]; blockers: number; warnings: number } };

const SEVERITY_STYLE: Record<AuditCheck["severity"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-900",
  info: "border-sky-200 bg-sky-50 text-sky-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  blocker: "border-red-200 bg-red-50 text-red-900",
};
const SEVERITY_WORD: Record<AuditCheck["severity"], string> = { ok: "Fine", info: "For your information", warning: "Look at this", blocker: "Must fix" };

export function AccountsNightAuditClient({
  slug,
  runs,
  business,
  settings,
  canRun,
  canChangeSettings,
  canAccessAllDepartments,
}: {
  slug: string;
  runs: NightAuditRunRow[];
  business: BusinessDateInfo;
  settings: NightAuditSettings;
  canRun: boolean;
  canChangeSettings: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(business.businessDate);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [reason, setReason] = useState("");
  const [report, setReport] = useState<AuditReport | null>(null);
  const [busyRun, setBusyRun] = useState<string | null>(null);

  // Reload the checks when a day is closed or reversed, not on every refresh of the page data.
  const runsKey = runs.map((r) => `${r.id}:${r.reversed}`).join(",");
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPreview(null);
    fetch(`/api/hotel/accounts/night-audit?${new URLSearchParams({ slug, date })}`)
      .then((res) => res.json())
      .then((json: Partial<Preview> & { error?: string }) => {
        if (!cancelled && !json.error && json.breakdown && json.checks) setPreview({ breakdown: json.breakdown, checks: json.checks });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, date, runsKey]);

  const standing = runs.find((r) => r.auditDate === date && !r.reversed);
  const latestStandingId = runs.find((r) => !r.reversed)?.id;
  const blockers = preview?.checks.blockers ?? 0;
  const warnings = preview?.checks.warnings ?? 0;
  const reasonMissing = warnings > 0 && reason.trim().length < 3;
  const breakdown = preview?.breakdown ?? null;

  const runAudit = async () => {
    setRunning(true);
    try {
      const res = await fetch("/api/hotel/accounts/night-audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, date, overrideReason: reason.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not close the day", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${date} is closed.`, [data.noShows ? `${data.noShows} no-show(s) handled.` : "", data.emailed ? `Report emailed to ${data.emailed}.` : ""].filter(Boolean).join(" ") || undefined);
      setReason("");
      const next = new Date(`${date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      setDate(next.toISOString().slice(0, 10));
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  const reopenDay = async (run: NightAuditRunRow) => {
    if (!window.confirm(`Reopen ${run.auditDate}? Nothing was posted for it, so it simply becomes the business date again.`)) return;
    setBusyRun(run.id);
    try {
      const res = await fetch("/api/hotel/accounts/night-audit", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, runId: run.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not reopen", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${run.auditDate} is open again.`);
      setDate(run.auditDate);
      router.refresh();
    } finally {
      setBusyRun(null);
    }
  };

  const openReport = async (run: NightAuditRunRow) => {
    setBusyRun(run.id);
    try {
      const res = await fetch(`/api/hotel/accounts/night-audit?${new URLSearchParams({ slug, run: run.id })}`);
      const data = (await res.json().catch(() => ({}))) as { report?: AuditReport | null };
      if (!data.report) {
        toastError("No report", "This day was closed before reports were kept.");
        return;
      }
      setReport(data.report);
      requestAnimationFrame(() => document.getElementById("night-audit-report")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } finally {
      setBusyRun(null);
    }
  };

  const emailReport = async (run: NightAuditRunRow) => {
    setBusyRun(run.id);
    try {
      const res = await fetch("/api/hotel/accounts/night-audit", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, runId: run.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not send", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Report for ${run.auditDate} sent to ${data.sent}.`);
      router.refresh();
    } finally {
      setBusyRun(null);
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Night audit"
        description="Closes the hotel's day: checks nothing is left open, charges overdue nights, handles no-shows, posts the day to the ledger and sends the end-of-day report."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard id="night-audit-business-date" title="Business date" icon={CalendarClock} meaning="money" className="print:hidden">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
          <p className="text-2xl font-semibold tabular-nums text-slate-900">{business.businessDate}</p>
          <p className="text-sm text-slate-600">
            Today at the hotel is {business.today}.{" "}
            {business.lastAudited ? `Last day closed: ${business.lastAudited}.` : "No day has been closed yet."}{" "}
            {business.daysBehind > 1 ? `The business date is ${business.daysBehind} days behind, so ${business.daysBehind} days are waiting to be closed.` : null}
            {!business.canAudit ? " This day has not finished yet; it can be closed from tomorrow." : null}
          </p>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {settings.autoRun ? `The day closes by itself from ${String(settings.autoRunHour).padStart(2, "0")}:00 hotel time if nobody has closed it.` : "Automatic closing is off."}
        </p>
      </HmsCard>

      <HmsCard
        id="night-audit-checks"
        title={`Before closing ${date}`}
        icon={ListChecks}
        meaning="money"
        className="print:hidden"
        actions={
          <div className="w-full sm:w-48">
            <HmsField id="night-audit-date" label="Day">
              <input id="night-audit-date" type="date" className={hmsInput} value={date} max={business.today} onChange={(e) => e.target.value && setDate(e.target.value)} />
            </HmsField>
          </div>
        }
      >
        {loading ? (
          <p role="status" className="text-sm text-slate-600">
            Checking…
          </p>
        ) : preview ? (
          <ul className="space-y-2">
            {preview.checks.checks.map((c) => (
              <li key={c.key} className={`rounded-xl border px-4 py-3 text-sm ${SEVERITY_STYLE[c.severity]}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 font-semibold">
                    {c.severity === "ok" ? <CheckCircle2 className="h-4 w-4" aria-hidden /> : <CircleAlert className="h-4 w-4" aria-hidden />}
                    {c.title}
                    {c.count > 0 ? <span className="font-normal">({c.count})</span> : null}
                    <span className="sr-only">: {SEVERITY_WORD[c.severity]}</span>
                  </p>
                  {(c.severity === "warning" || c.severity === "blocker") && c.fixPath ? (
                    <Link href={`/hms/${slug}/${c.fixPath}`} className="font-medium underline underline-offset-2">
                      Go and fix
                    </Link>
                  ) : null}
                </div>
                <p className="mt-1">{c.detail}</p>
                {c.items.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5">
                    {c.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">The checks couldn&apos;t be loaded.</p>
        )}
      </HmsCard>

      <HmsCard
        id="night-audit-day"
        title={`Day summary for ${date}`}
        icon={Moon}
        meaning="money"
        className="print:border-0 print:shadow-none"
      >
        {loading ? (
          <p role="status" className="text-sm text-slate-600">
            Loading…
          </p>
        ) : breakdown ? (
          <div className="space-y-4">
            <HmsStatStrip label={`Revenue and settlements for ${date}`}>
              <HmsStatTile label="Room revenue" value={fmt(breakdown.roomRevenue)} icon={BedDouble} meaning="rooms" />
              <HmsStatTile label="F&B revenue" value={fmt(breakdown.fbRevenue)} icon={UtensilsCrossed} meaning="food" />
              <HmsStatTile label="Other department revenue" value={fmt(breakdown.otherRevenue)} icon={Shapes} meaning="money" />
              <HmsStatTile
                label="Unclassified revenue"
                value={fmt(breakdown.unclassifiedRevenue)}
                icon={CircleHelp}
                meaning={breakdown.unclassifiedRevenue !== 0 ? "attention" : "neutral"}
                status={breakdown.unclassifiedRevenue !== 0 ? "warning" : undefined}
                statusText="Needs a department"
              />
              <HmsStatTile
                label="VAT and levies"
                value={fmt(breakdown.taxesCollected)}
                icon={Landmark}
                meaning="money"
                hint="Charged on rooms for the government; goes to Taxes Payable"
              />
              <HmsStatTile label="Cash" value={fmt(breakdown.cashTotal)} icon={Banknote} meaning="money" />
              <HmsStatTile label="Card / POS" value={fmt(breakdown.cardTotal)} icon={CreditCard} meaning="money" />
              <HmsStatTile label="City ledger" value={fmt(breakdown.cityLedgerTotal)} icon={Building2} meaning="money" />
              <HmsStatTile label="Guest ledger movement" value={fmt(breakdown.guestLedgerNet)} icon={BookUser} meaning="guests" />
            </HmsStatStrip>
            {breakdown.unclassifiedRevenue !== 0 ? (
              <Warning>
                {fmt(Math.abs(breakdown.unclassifiedRevenue))} in charges had no department tag and posted to Miscellaneous Income.
                Review and reclassify the source transactions when convenient.
              </Warning>
            ) : null}
            {breakdown.unmatchedPaymentTotal !== 0 ? (
              <Warning>
                {fmt(breakdown.unmatchedPaymentTotal)} in payments had an unrecognised settlement method and were not matched to a
                clearing account.
              </Warning>
            ) : null}
            <p className="text-sm text-slate-600">
              {breakdown.folioLineCount} folio line(s), {breakdown.walkInFbOrderCount} walk-in F&amp;B order(s) for {date}. Overdue nights and no-shows are
              added when the day is closed.
            </p>

            {canRun ? (
              <div className="space-y-3 border-t border-slate-100 pt-4 print:hidden">
                {warnings > 0 && !standing && blockers === 0 ? (
                  <HmsField id="night-audit-reason" label="Why close the day with things still open?">
                    <input id="night-audit-reason" className={hmsInput} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="For example: the three bills are being settled at breakfast" />
                  </HmsField>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    className={`${hmsButton.primary} w-full sm:w-auto`}
                    disabled={running || loading || Boolean(standing) || blockers > 0 || (warnings > 0 && reasonMissing)}
                    onClick={() => void runAudit()}
                  >
                    {running ? "Closing…" : standing ? "Already closed" : `Close ${date}`}
                  </button>
                  {blockers > 0 ? <p className="text-sm text-red-700">Fix the items marked &ldquo;Must fix&rdquo; first.</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-slate-600">No activity found for this date.</p>
        )}
      </HmsCard>

      {report ? <NightAuditReportView report={report} onClose={() => setReport(null)} /> : null}

      <HmsCard id="night-audit-history" title="Days closed" icon={History} meaning="money" flush className="print:hidden">
        {runs.length === 0 ? (
          <HmsEmptyState
            bare
            art="page"
            meaning="money"
            title="No night audits run yet"
            description="Each day you close appears here with its totals and its report."
          />
        ) : (
          <>
          <ul className="divide-y divide-slate-100 md:hidden">
            {runs.map((r) => (
              <li key={r.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold tabular-nums text-slate-900">
                      {r.auditDate}
                      {r.reversed ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Reversed</span> : null}
                    </p>
                    <p className="text-xs text-slate-600">
                      {formatDateTime(r.createdAt)} · {r.automatic ? "Automatically" : "By staff"}
                      {r.noShowsProcessed > 0 ? ` · ${r.noShowsProcessed} no-show(s)` : ""}
                      {r.exceptionCount > 0 ? ` · ${r.exceptionCount} left open` : ""}
                    </p>
                    {r.overrideReason ? <p className="text-xs text-slate-600">Reason: {r.overrideReason}</p> : null}
                  </div>
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Room</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmt(r.breakdown.roomRevenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-600">F&amp;B</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmt(r.breakdown.fbRevenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Other</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmt(r.breakdown.otherRevenue)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Guest ledger</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{fmt(r.breakdown.guestLedgerNet)}</dd>
                  </div>
                </dl>
                <div className="grid grid-cols-2 gap-2 *:w-full">
                  {r.hasReport ? (
                    <>
                      <button type="button" className={hmsButton.small} disabled={busyRun === r.id} onClick={() => void openReport(r)}>
                        View report
                      </button>
                      {canRun ? (
                        <button type="button" className={hmsButton.small} disabled={busyRun === r.id} onClick={() => void emailReport(r)}>
                          {r.emailedAt ? "Email again" : "Email"}
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <p className="col-span-2 text-sm text-slate-500">No report kept</p>
                  )}
                  {canChangeSettings && !r.journalEntryId && !r.reversed && r.id === latestStandingId ? (
                    <button type="button" className={`${hmsButton.small} col-span-2`} disabled={busyRun === r.id} onClick={() => void reopenDay(r)}>
                      Reopen
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-215 text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3">Date</th>
                  <th scope="col" className="px-5 py-3 text-right">Room</th>
                  <th scope="col" className="px-5 py-3 text-right">F&amp;B</th>
                  <th scope="col" className="px-5 py-3 text-right">Other</th>
                  <th scope="col" className="px-5 py-3 text-right">Guest ledger</th>
                  <th scope="col" className="px-5 py-3">Closed</th>
                  <th scope="col" className="px-5 py-3">Report</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <th scope="row" className="whitespace-nowrap px-5 py-3 text-left font-medium tabular-nums text-slate-900">
                      {r.auditDate}
                      {r.reversed ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Reversed</span> : null}
                    </th>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.roomRevenue)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.fbRevenue)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.otherRevenue)}</td>
                    <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-700">{fmt(r.breakdown.guestLedgerNet)}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">
                      <span className="whitespace-nowrap">{formatDateTime(r.createdAt)}</span>
                      <span className="block text-xs">
                        {r.automatic ? "Automatically" : "By staff"}
                        {r.noShowsProcessed > 0 ? ` · ${r.noShowsProcessed} no-show(s)` : ""}
                        {r.exceptionCount > 0 ? ` · ${r.exceptionCount} left open` : ""}
                      </span>
                      {r.overrideReason ? <span className="block text-xs">Reason: {r.overrideReason}</span> : null}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3">
                      {r.hasReport ? (
                        <div className="flex gap-1">
                          <button type="button" className={hmsButton.small} disabled={busyRun === r.id} onClick={() => void openReport(r)}>
                            View
                          </button>
                          {canRun ? (
                            <button type="button" className={hmsButton.small} disabled={busyRun === r.id} onClick={() => void emailReport(r)}>
                              {r.emailedAt ? "Email again" : "Email"}
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-slate-500">None kept</span>
                      )}
                      {canChangeSettings && !r.journalEntryId && !r.reversed && r.id === latestStandingId ? (
                        <button type="button" className={`${hmsButton.small} ml-1`} disabled={busyRun === r.id} onClick={() => void reopenDay(r)}>
                          Reopen
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </HmsCard>

      {canChangeSettings ? <NightAuditSettingsCard slug={slug} settings={settings} businessDate={business.businessDate} today={business.today} /> : null}
    </HmsPage>
  );
}
