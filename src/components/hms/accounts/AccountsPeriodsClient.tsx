"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, CircleCheck, Lock, LockOpen } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { addMonths, canCloseMonth, monthsBetween, monthStartOf, type PeriodChecks, type PeriodRow } from "@/lib/hms/accounting-periods";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const MONTHS_SHOWN = 18;

function monthLabel(month: string) {
  return new Date(`${month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function AccountsPeriodsClient({
  slug,
  periods,
  today,
  canClose,
  canReopen,
  canAccessAllDepartments,
}: {
  slug: string;
  periods: PeriodRow[];
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

  return (
    <HmsPage>
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
                <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <div className="flex items-center gap-2">
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
                        <div className="flex gap-2 pt-1">
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
                    <div className="flex gap-2">
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
    </HmsPage>
  );
}
