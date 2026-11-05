"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Lock, LockOpen } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { addMonths, canCloseMonth, monthsBetween, monthStartOf, type PeriodChecks, type PeriodRow } from "@/lib/hms/accounting-periods";
import type { YearEndPreview, YearEndRow } from "@/lib/hms/year-end-close";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const MONTHS_SHOWN = 18;

function monthLabel(month: string) {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function AccountsPeriodsClient({
  slug,
  periods,
  yearEnds,
  today,
  canClose,
  canReopen,
  canAccessAllDepartments,
}: {
  slug: string;
  periods: PeriodRow[];
  yearEnds: YearEndRow[];
  today: string;
  canClose: boolean;
  canReopen: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [checks, setChecks] = useState<PeriodChecks | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [yearReview, setYearReview] = useState<number | null>(null);
  const [preview, setPreview] = useState<YearEndPreview | null>(null);
  const [yearUndo, setYearUndo] = useState<number | null>(null);
  const [yearReason, setYearReason] = useState("");

  const rows = useMemo(() => {
    const byMonth = new Map(periods.map((p) => [p.month, p]));
    const current = monthStartOf(today);
    return monthsBetween(addMonths(current, -(MONTHS_SHOWN - 1)), current)
      .reverse()
      .map((month) => byMonth.get(month) ?? { month, status: "open" as const, closedAt: null, closedBy: null, reopenedAt: null, reopenReason: null });
  }, [periods, today]);

  const review = async (month: string) => {
    setReopening(null);
    setReviewing(month);
    setChecks(null);
    const res = await fetch(`/api/hotel/accounts/periods?slug=${encodeURIComponent(slug)}&month=${month}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not check the month", data.error ?? "Try again.");
      setReviewing(null);
      return;
    }
    setChecks(data.checks);
  };

  const send = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update the month", data.error ?? "Try again.");
        return;
      }
      toastSuccess(done);
      setReviewing(null);
      setReopening(null);
      setReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const reviewYear = async (year: number) => {
    setYearUndo(null);
    setYearReview(year);
    setPreview(null);
    const res = await fetch(`/api/hotel/accounts/year-end?slug=${encodeURIComponent(slug)}&year=${year}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not check the year", data.error ?? "Try again.");
      setYearReview(null);
      return;
    }
    setPreview(data.preview);
  };

  const sendYear = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/year-end", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update the year", data.error ?? "Try again.");
        return;
      }
      toastSuccess(done);
      setYearReview(null);
      setYearUndo(null);
      setYearReason("");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Period close"
        description="Close a finished month to lock it. Once closed, nothing can be posted, changed or removed in that month. Only the owner can reopen it, and the reason is logged."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard id="accounting-periods" title="Months" icon={Lock} meaning="money" flush>
        <ul className="divide-y divide-slate-100">
          {rows.map((p) => {
            const closed = p.status === "closed";
            const finished = canCloseMonth(p.month, today).ok;
            return (
              <li key={p.month} className="px-5 py-4 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">{monthLabel(p.month)}</p>
                    <p className="text-sm text-slate-600">
                      {closed && p.closedAt
                        ? `Closed ${formatDateTime(p.closedAt)}`
                        : p.reopenReason
                          ? `Reopened: ${p.reopenReason}`
                          : finished
                            ? "Finished, not yet closed"
                            : "Still running"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <HmsPill tone={closed ? "green" : "blue"}>{closed ? "Closed" : "Open"}</HmsPill>
                    {closed && canReopen ? (
                      <button type="button" className={hmsButton.small} onClick={() => { setReviewing(null); setReopening(p.month); setReason(""); }}>
                        <LockOpen className="h-4 w-4" aria-hidden /> Reopen
                      </button>
                    ) : null}
                    {!closed && canClose && finished ? (
                      <button type="button" className={hmsButton.small} onClick={() => void review(p.month)}>
                        <Lock className="h-4 w-4" aria-hidden /> Close month
                      </button>
                    ) : null}
                  </div>
                </div>

                {reviewing === p.month ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" role="region" aria-label={`Checks before closing ${monthLabel(p.month)}`}>
                    {!checks ? (
                      <p className="text-slate-600">Checking the month…</p>
                    ) : (
                      <>
                        <p className="flex items-center gap-2 text-slate-800">
                          <CircleCheck className="h-4 w-4 text-emerald-700" aria-hidden />
                          {checks.entryCount} journal {checks.entryCount === 1 ? "entry" : "entries"} in this month.
                        </p>
                        {Math.abs(checks.trialBalanceDifference) > 0.01 ? (
                          <p className="flex gap-2 text-rose-800">
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            The trial balance is out by {checks.trialBalanceDifference.toFixed(2)}. Look into this before closing.
                          </p>
                        ) : (
                          <p className="flex items-center gap-2 text-slate-800">
                            <CircleCheck className="h-4 w-4 text-emerald-700" aria-hidden />
                            The trial balance balances.
                          </p>
                        )}
                        {checks.unauditedDates.length > 0 ? (
                          <p className="flex gap-2 text-amber-900">
                            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                            No night audit for {checks.unauditedDates.length} {checks.unauditedDates.length === 1 ? "day" : "days"}:{" "}
                            {checks.unauditedDates.slice(0, 5).join(", ")}
                            {checks.unauditedDates.length > 5 ? " and more" : ""}. Closing locks them as they are.
                          </p>
                        ) : null}
                        <div className="grid grid-cols-1 gap-2 pt-1 min-[420px]:grid-cols-2 sm:flex">
                          <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => void send({ action: "close", month: p.month }, `${monthLabel(p.month)} closed`)}>
                            {busy ? "Closing…" : "Close and lock this month"}
                          </button>
                          <button type="button" className={hmsButton.secondary} onClick={() => setReviewing(null)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ) : null}

                {reopening === p.month ? (
                  <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                    <HmsField id={`reopen-reason-${p.month}`} label="Why is this month being reopened?">
                      <input id={`reopen-reason-${p.month}`} className={hmsInput} value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} />
                    </HmsField>
                    <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex">
                      <button
                        type="button"
                        className={hmsButton.primary}
                        disabled={busy || !reason.trim()}
                        onClick={() => void send({ action: "reopen", month: p.month, reason }, `${monthLabel(p.month)} reopened`)}
                      >
                        {busy ? "Reopening…" : "Reopen month"}
                      </button>
                      <button type="button" className={hmsButton.secondary} onClick={() => setReopening(null)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </HmsCard>
      <HmsCard
        id="year-end-close"
        title="Year-end close"
        description="Moves the year's profit or loss into Retained Earnings, then locks every month of that year. Income statements still show the year as it was."
        icon={Lock}
        meaning="money"
        flush
      >
        <ul className="divide-y divide-slate-100">
          {yearEnds.map((y) => (
            <li key={y.year} className="px-5 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{y.year}</p>
                  <p className="text-sm text-slate-600">
                    {y.closed
                      ? `${(y.netIncome ?? 0) >= 0 ? "Profit" : "Loss"} of ${Math.abs(y.netIncome ?? 0).toFixed(2)} moved to Retained Earnings`
                      : "Not closed"}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <HmsPill tone={y.closed ? "green" : "blue"}>{y.closed ? "Closed" : "Open"}</HmsPill>
                  {y.closed && canReopen ? (
                    <button type="button" className={hmsButton.small} onClick={() => { setYearReview(null); setYearUndo(y.year); setYearReason(""); }}>
                      <LockOpen className="h-4 w-4" aria-hidden /> Undo
                    </button>
                  ) : null}
                  {!y.closed && canClose ? (
                    <button type="button" className={hmsButton.small} onClick={() => void reviewYear(y.year)}>
                      <Lock className="h-4 w-4" aria-hidden /> Close year
                    </button>
                  ) : null}
                </div>
              </div>

              {yearReview === y.year ? (
                <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm" role="region" aria-label={`Checks before closing ${y.year}`}>
                  {!preview ? (
                    <p className="text-slate-600">Working out the year…</p>
                  ) : (
                    <>
                      <p className="text-slate-800">
                        Revenue {preview.revenueTotal.toFixed(2)}, expenses {preview.expenseTotal.toFixed(2)}.{" "}
                        <strong>
                          {preview.netIncome >= 0 ? "Profit" : "Loss"} of {Math.abs(preview.netIncome).toFixed(2)}
                        </strong>{" "}
                        will move to Retained Earnings, clearing {preview.accountCount} {preview.accountCount === 1 ? "account" : "accounts"}.
                      </p>
                      {preview.monthsToLock.length > 0 ? (
                        <p className="flex gap-2 text-amber-900">
                          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                          {preview.monthsToLock.length} {preview.monthsToLock.length === 1 ? "month" : "months"} of {y.year} will be locked too.
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 gap-2 pt-1 min-[420px]:grid-cols-2 sm:flex">
                        <button type="button" className={hmsButton.primary} disabled={busy} onClick={() => void sendYear({ action: "close", year: y.year }, `${y.year} closed`)}>
                          {busy ? "Closing…" : `Close ${y.year}`}
                        </button>
                        <button type="button" className={hmsButton.secondary} onClick={() => setYearReview(null)}>
                          Cancel
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}

              {yearUndo === y.year ? (
                <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
                  <HmsField id={`undo-year-${y.year}`} label="Why is this year-end close being undone?">
                    <input id={`undo-year-${y.year}`} className={hmsInput} value={yearReason} maxLength={300} onChange={(e) => setYearReason(e.target.value)} />
                  </HmsField>
                  <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex">
                    <button
                      type="button"
                      className={hmsButton.primary}
                      disabled={busy || !yearReason.trim()}
                      onClick={() => void sendYear({ action: "undo", year: y.year, reason: yearReason }, `${y.year} reopened`)}
                    >
                      {busy ? "Undoing…" : "Undo year-end close"}
                    </button>
                    <button type="button" className={hmsButton.secondary} onClick={() => setYearUndo(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </HmsCard>
    </HmsPage>
  );
}
