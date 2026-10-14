"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Plus, Wallet } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { ProcurementBudgetWithSpend } from "@/lib/hms/procurement-types";

const DEPARTMENT_OPTIONS = ["Kitchen", "Bar", "Housekeeping", "Front Desk", "Engineering", "Procurement", "Other"] as const;

function barColor(percentUsed: number) {
  if (percentUsed >= 100) return "bg-rose-600";
  if (percentUsed >= 90) return "bg-amber-500";
  return "bg-emerald-500";
}

export function ProcurementBudgetsClient({ slug, budgets, currency }: { slug: string; budgets: ProcurementBudgetWithSpend[]; currency: string }) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);

  const newButton = (
    <button type="button" className={hmsButton.primary} onClick={() => setNewOpen(true)}>
      <Plus className="h-4 w-4" aria-hidden /> New budget period
    </button>
  );

  return (
    <div className="space-y-6">
      {budgets.length === 0 ? (
        <HmsEmptyState
          art="chart"
          meaning="money"
          title="No department budgets yet"
          description="Set a budget for a department and period, and spend from approved purchase orders will be tracked against it."
          action={newButton}
        />
      ) : (
        <HmsCard
          id="procurement-budgets"
          title="Department budgets"
          description="Spend so far against each budget period."
          icon={Wallet}
          meaning="money"
          actions={newButton}
        >
          <ul className="grid gap-4 md:grid-cols-2">
            {budgets.map((b) => {
              const status = budgetStatus(b.percentUsed);
              return (
                <li key={b.id} className={`rounded-2xl border p-5 ${status.border}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-heading text-base font-semibold text-slate-900">{b.department}</h3>
                      <p className="text-sm text-slate-600">
                        {b.period_start} to {b.period_end}
                      </p>
                    </div>
                    <HmsPill tone={status.tone}>
                      {status.icon ? <CircleAlert className="mr-1 h-3.5 w-3.5" aria-hidden /> : null}
                      {status.label}
                    </HmsPill>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">
                    <span className="font-semibold tabular-nums text-slate-900">{formatPricingAmount(b.spent, b.currency)}</span> spent of{" "}
                    <span className="tabular-nums">{formatPricingAmount(b.amount, b.currency)}</span>
                  </p>
                  <div
                    role="progressbar"
                    aria-label={`${b.department} budget used`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.min(b.percentUsed, 100)}
                    aria-valuetext={`${b.percentUsed}% used`}
                    className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                  >
                    <div className={`h-full rounded-full ${barColor(b.percentUsed)}`} style={{ width: `${Math.min(b.percentUsed, 100)}%` }} />
                  </div>
                  <p className="mt-2 flex flex-wrap justify-between gap-2 text-sm text-slate-700">
                    <span className="font-medium tabular-nums">{b.percentUsed}% used</span>
                    <span className={`tabular-nums ${b.remaining < 0 ? "font-medium text-rose-700" : ""}`}>
                      {b.remaining < 0
                        ? `${formatPricingAmount(Math.abs(b.remaining), b.currency)} over budget`
                        : `${formatPricingAmount(b.remaining, b.currency)} remaining`}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </HmsCard>
      )}

      <NewBudgetDialog slug={slug} open={newOpen} onOpenChange={setNewOpen} defaultCurrency={currency} onDone={() => router.refresh()} />
    </div>
  );
}

function budgetStatus(percentUsed: number): { label: string; tone: "green" | "amber" | "red"; border: string; icon: boolean } {
  if (percentUsed > 100) return { label: "Over budget", tone: "red", border: "border-rose-200 bg-rose-50/40", icon: true };
  if (percentUsed >= 100) return { label: "Budget used up", tone: "red", border: "border-rose-200 bg-rose-50/40", icon: true };
  if (percentUsed >= 90) return { label: "Nearly used up", tone: "amber", border: "border-amber-200", icon: true };
  return { label: "On track", tone: "green", border: "border-slate-200", icon: false };
}

function NewBudgetDialog({
  slug,
  open,
  onOpenChange,
  defaultCurrency,
  onDone,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultCurrency: string;
  onDone: () => void;
}) {
  const [department, setDepartment] = useState<string>("");
  const [customDepartment, setCustomDepartment] = useState("");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const resolvedDepartment = department === "Other" ? customDepartment.trim() : department;
  const canSubmit = resolvedDepartment.length > 0 && periodStart && periodEnd && Number(amount) > 0;

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/procurement/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          department: resolvedDepartment,
          periodStart,
          periodEnd,
          amount: Number(amount),
          currency: defaultCurrency,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save budget", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Budget saved");
      onOpenChange(false);
      onDone();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New budget period</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <HmsField id="budget-department" label="Department">
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger id="budget-department" className="h-11 rounded-xl">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENT_OPTIONS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </HmsField>
          {department === "Other" ? (
            <HmsField id="budget-custom-department" label="Department name">
              <input id="budget-custom-department" className={hmsInput} value={customDepartment} onChange={(e) => setCustomDepartment(e.target.value)} />
            </HmsField>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <HmsField id="budget-period-start" label="Period start">
              <input id="budget-period-start" type="date" className={hmsInput} value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </HmsField>
            <HmsField id="budget-period-end" label="Period end">
              <input id="budget-period-end" type="date" className={hmsInput} value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </HmsField>
          </div>
          <HmsField id="budget-amount" label={`Budget amount (${defaultCurrency})`}>
            <input
              id="budget-amount"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              className={`${hmsInput} tabular-nums`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </HmsField>
        </div>
        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save budget"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
