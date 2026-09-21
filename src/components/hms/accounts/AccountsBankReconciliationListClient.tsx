"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import type { BankReconciliationRow } from "@/lib/hms/bank-reconciliation";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

export function AccountsBankReconciliationListClient({
  slug,
  accountsWithHistory,
  currency,
  canReconcile,
  canAccessAllDepartments,
}: {
  slug: string;
  accountsWithHistory: { account: ChartOfAccountRow; reconciliations: BankReconciliationRow[] }[];
  currency: string;
  canReconcile: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [startingFor, setStartingFor] = useState<ChartOfAccountRow | null>(null);
  const [periodEndDate, setPeriodEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementEndingBalance, setStatementEndingBalance] = useState("");
  const [saving, setSaving] = useState(false);

  const startReconciliation = async () => {
    if (!startingFor) return;
    if (statementEndingBalance.trim() === "") {
      toastError("Statement balance required", "Enter the ending balance shown on the bank statement.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/accounts/bank-reconciliations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          accountId: startingFor.id,
          periodEndDate,
          statementEndingBalance: Number(statementEndingBalance),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not start reconciliation", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Reconciliation started");
      router.push(`/hms/${slug}/accounts/bank-reconciliation/${data.id}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <h1 className="text-xl font-semibold text-slate-900">Bank reconciliation</h1>
      <p className="mt-0.5 text-sm text-slate-500">
        Confirm the ledger agrees with what the bank actually shows for each bank/cash account{currency ? ` (${currency})` : ""}.
      </p>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {accountsWithHistory.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No bank/cash accounts yet — mark an account as cash-equivalent in the chart of accounts first.
        </div>
      ) : (
        <div className="mt-6 space-y-4">
          {accountsWithHistory.map(({ account, reconciliations }) => {
            const inProgress = reconciliations.find((r) => r.status === "in_progress");
            const lastCompleted = reconciliations.find((r) => r.status === "completed");
            return (
              <div key={account.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-900">
                      <code className="mr-2 font-mono text-xs text-slate-400">{account.code}</code>
                      {account.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {lastCompleted
                        ? `Last reconciled ${new Date(lastCompleted.periodEndDate).toLocaleDateString()}`
                        : "Never reconciled"}
                    </p>
                  </div>
                  {inProgress ? (
                    <Link href={`/hms/${slug}/accounts/bank-reconciliation/${inProgress.id}`}>
                      <Button type="button" variant="outline" size="sm">
                        Resume ({new Date(inProgress.periodEndDate).toLocaleDateString()})
                      </Button>
                    </Link>
                  ) : canReconcile ? (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => {
                        setStartingFor(account);
                        setStatementEndingBalance("");
                        setPeriodEndDate(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      Start reconciliation
                    </Button>
                  ) : null}
                </div>
                {reconciliations.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
                    {reconciliations.slice(0, 3).map((r) => (
                      <li key={r.id} className="flex items-center justify-between">
                        <Link href={`/hms/${slug}/accounts/bank-reconciliation/${r.id}`} className="hover:underline">
                          {new Date(r.periodEndDate).toLocaleDateString()} — statement {r.statementEndingBalance.toFixed(2)}
                        </Link>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 font-medium",
                            r.status === "completed" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900",
                          )}
                        >
                          {r.status === "completed" ? "Completed" : "In progress"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(startingFor)} onOpenChange={(open) => !open && setStartingFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start reconciliation — {startingFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Statement period end date</p>
              <Input type="date" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Statement ending balance</p>
              <Input
                type="number"
                step="0.01"
                value={statementEndingBalance}
                onChange={(e) => setStatementEndingBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setStartingFor(null)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void startReconciliation()}>
              {saving ? "Starting…" : "Start"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
