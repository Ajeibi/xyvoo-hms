"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { ProcurementBudgetWithSpend } from "@/lib/hms/procurement-types";

const DEPARTMENT_OPTIONS = ["Kitchen", "Bar", "Housekeeping", "Front Desk", "Engineering", "Procurement", "Other"] as const;

function barColor(percentUsed: number) {
  if (percentUsed >= 100) return "bg-red-500";
  if (percentUsed >= 90) return "bg-amber-500";
  return "bg-emerald-500";
}

export function ProcurementBudgetsClient({ slug, budgets, currency }: { slug: string; budgets: ProcurementBudgetWithSpend[]; currency: string }) {
  const router = useRouter();
  const [newOpen, setNewOpen] = useState(false);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex justify-end">
        <Button type="button" className="rounded-lg" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> New budget period
        </Button>
      </div>

      {budgets.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
          No department budgets configured yet.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {budgets.map((b) => (
            <div key={b.id} className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">{b.department}</p>
                <p className="text-xs text-slate-400">
                  {b.period_start} → {b.period_end}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {formatPricingAmount(b.spent, b.currency)} of {formatPricingAmount(b.amount, b.currency)}
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div className={`h-full rounded-full ${barColor(b.percentUsed)}`} style={{ width: `${Math.min(b.percentUsed, 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{b.percentUsed}% used · {formatPricingAmount(b.remaining, b.currency)} remaining</p>
            </div>
          ))}
        </div>
      )}

      <NewBudgetDialog slug={slug} open={newOpen} onOpenChange={setNewOpen} defaultCurrency={currency} onDone={() => router.refresh()} />
    </div>
  );
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
        <div className="space-y-3">
          <Select value={department} onValueChange={setDepartment}>
            <SelectTrigger>
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
          {department === "Other" ? <Input value={customDepartment} onChange={(e) => setCustomDepartment(e.target.value)} placeholder="Department name" /> : null}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Period start</label>
              <Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Period end</label>
              <Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <Input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Budget amount (${defaultCurrency})`} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save budget"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
