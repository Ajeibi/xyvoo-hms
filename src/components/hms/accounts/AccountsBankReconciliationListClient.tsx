"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Landmark } from "lucide-react";
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
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Bank reconciliation"
        description={`Check the ledger agrees with what the bank actually shows for each bank and cash account${currency ? ` (${currency})` : ""}.`}
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {accountsWithHistory.length === 0 ? (
        <HmsEmptyState
          icon={Landmark}
          meaning="money"
          title="No bank or cash accounts yet"
          description="Mark an account as cash-equivalent in the chart of accounts, and it will appear here."
          action={
            <Link href={`/hms/${slug}/accounts/chart`} className={`${hmsButton.primary} print:hidden`}>
              Go to chart of accounts
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {accountsWithHistory.map(({ account, reconciliations }) => {
            const inProgress = reconciliations.find((r) => r.status === "in_progress");
            const lastCompleted = reconciliations.find((r) => r.status === "completed");
            return (
              <HmsCard
                key={account.id}
                id={`bank-rec-${account.id}`}
                title={
                  <>
                    <span className="mr-2 font-mono text-sm tabular-nums text-slate-600">{account.code}</span>
                    {account.name}
                  </>
                }
                description={
                  lastCompleted ? `Last reconciled ${new Date(lastCompleted.periodEndDate).toLocaleDateString()}` : "Never reconciled"
                }
                icon={Landmark}
                meaning="money"
                className="print:border-0 print:shadow-none"
                actions={
                  inProgress ? (
                    <Link href={`/hms/${slug}/accounts/bank-reconciliation/${inProgress.id}`} className={`${hmsButton.secondary} print:hidden`}>
                      Resume ({new Date(inProgress.periodEndDate).toLocaleDateString()})
                    </Link>
                  ) : canReconcile ? (
                    <button
                      type="button"
                      className={`${hmsButton.primary} print:hidden`}
                      onClick={() => {
                        setStartingFor(account);
                        setStatementEndingBalance("");
                        setPeriodEndDate(new Date().toISOString().slice(0, 10));
                      }}
                    >
                      Start reconciliation
                    </button>
                  ) : null
                }
              >
                {reconciliations.length > 0 ? (
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Recent reconciliations for {account.name}</caption>
                    <thead className="border-b border-slate-200 text-sm font-medium text-slate-600">
                      <tr>
                        <th scope="col" className="py-2 pr-3">Period end</th>
                        <th scope="col" className="py-2 pr-3 text-right">Statement balance</th>
                        <th scope="col" className="py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reconciliations.slice(0, 3).map((r) => (
                        <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                          <td className="py-3 pr-3">
                            <Link
                              href={`/hms/${slug}/accounts/bank-reconciliation/${r.id}`}
                              className="rounded font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              {new Date(r.periodEndDate).toLocaleDateString()}
                            </Link>
                          </td>
                          <td className="py-3 pr-3 text-right tabular-nums text-slate-900">{r.statementEndingBalance.toFixed(2)}</td>
                          <td className="py-3 text-right">
                            <HmsPill tone={r.status === "completed" ? "green" : "amber"}>
                              {r.status === "completed" ? "Completed" : "In progress"}
                            </HmsPill>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm text-slate-600">No reconciliations yet for this account.</p>
                )}
              </HmsCard>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(startingFor)} onOpenChange={(open) => !open && setStartingFor(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Start reconciliation: {startingFor?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <HmsField id="rec-period-end" label="Statement period end date">
              <input id="rec-period-end" type="date" className={hmsInput} value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
            </HmsField>
            <HmsField id="rec-statement-balance" label="Statement ending balance" hint="The closing balance printed on the bank statement.">
              <input
                id="rec-statement-balance"
                type="number"
                step="0.01"
                aria-describedby="rec-statement-balance-hint"
                className={`${hmsInput} tabular-nums`}
                value={statementEndingBalance}
                onChange={(e) => setStatementEndingBalance(e.target.value)}
                placeholder="0.00"
              />
            </HmsField>
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
    </HmsPage>
  );
}
