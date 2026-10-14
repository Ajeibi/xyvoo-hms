"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import { ACCOUNTS_DEPARTMENTS } from "@/lib/hms/journal-entries";
import type { VendorBillRow } from "@/lib/hms/vendor-bills";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { Plus, ReceiptText } from "lucide-react";

type VendorOption = { id: string; name: string; currency: string };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  paid: "Paid",
};

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  draft: "slate",
  pending_approval: "amber",
  approved: "green",
  rejected: "red",
  cancelled: "slate",
  paid: "green",
};

function isPastDue(dueDate: string | null) {
  return !!dueDate && dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function emptyForm(defaultDepartment: string, defaultCurrency: string) {
  return {
    vendorId: "",
    department: defaultDepartment,
    billReference: "",
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currency: defaultCurrency,
    fxRate: "1",
    expenseAccountId: "",
    subtotal: "",
    tax: "",
    notes: "",
  };
}

function emptyPaymentForm() {
  return {
    bankAccountId: "",
    paymentDate: new Date().toISOString().slice(0, 10),
    reference: "",
  };
}

export function AccountsVendorBillsClient({
  slug,
  bills,
  accounts,
  vendors,
  canCreate,
  canApprove,
  canRecordPayment,
  canAccessAllDepartments,
  defaultCurrency = "NGN",
}: {
  slug: string;
  bills: VendorBillRow[];
  accounts: ChartOfAccountRow[];
  vendors: VendorOption[];
  canCreate: boolean;
  canApprove: boolean;
  canRecordPayment: boolean;
  canAccessAllDepartments: boolean;
  defaultCurrency?: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(ACCOUNTS_DEPARTMENTS[0], defaultCurrency));
  const [saving, setSaving] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payOpen, setPayOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState(emptyPaymentForm);
  const [paying, setPaying] = useState(false);

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedBills = bills.filter((b) => selectedIds.has(b.id));
  const remainingFor = (b: VendorBillRow) => Math.max(0, Math.round((b.total - b.amountPaid) * 100) / 100);
  const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({});
  const amountFor = (b: VendorBillRow) => Number(paymentAmounts[b.id] ?? remainingFor(b)) || 0;
  const selectedTotal = selectedBills.reduce((sum, b) => sum + amountFor(b), 0);

  const startBusy = (id: string) => setBusyIds((prev) => new Set(prev).add(id));
  const stopBusy = (id: string) =>
    setBusyIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });

  const subtotal = Number(form.subtotal) || 0;
  const tax = Number(form.tax) || 0;
  const total = subtotal + tax;

  const submitCreate = async () => {
    if (!form.vendorId) {
      toastError("Vendor required", "Select which vendor this bill is from.");
      return;
    }
    if (!form.expenseAccountId) {
      toastError("Account required", "Select which account this bill's cost hits.");
      return;
    }
    if (total <= 0) {
      toastError("Amount required", "Enter a subtotal greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/accounts/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          vendorId: form.vendorId,
          department: form.department,
          billReference: form.billReference.trim() || undefined,
          billDate: form.billDate,
          dueDate: form.dueDate || undefined,
          currency: form.currency,
          fxRate: Number(form.fxRate) || 1,
          expenseAccountId: form.expenseAccountId,
          subtotal,
          tax,
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create bill", data.error ?? "Try again.");
        return;
      }
      toastSuccess(data.status === "approved" ? "Bill created and posted to the ledger." : "Bill created, awaiting approval.");
      setCreateOpen(false);
      setForm(emptyForm(ACCOUNTS_DEPARTMENTS[0], defaultCurrency));
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const approve = async (id: string) => {
    startBusy(id);
    try {
      const res = await fetch(`/api/hotel/accounts/vendor-bills/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not approve bill", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Bill approved and posted to the ledger.");
      router.refresh();
    } finally {
      stopBusy(id);
    }
  };

  const submitReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) {
      toastError("Reason required", "Explain why this bill is being rejected.");
      return;
    }
    setRejecting(true);
    try {
      const res = await fetch(`/api/hotel/accounts/vendor-bills/${rejectTarget}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reason: rejectReason.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not reject bill", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Bill rejected.");
      setRejectTarget(null);
      setRejectReason("");
      router.refresh();
    } finally {
      setRejecting(false);
    }
  };

  const submitPayment = async () => {
    if (!paymentForm.bankAccountId) {
      toastError("Account required", "Select which account is paying this out.");
      return;
    }
    if (selectedBills.length === 0) return;
    setPaying(true);
    try {
      const res = await fetch("/api/hotel/accounts/vendor-bill-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          paymentDate: paymentForm.paymentDate,
          bankAccountId: paymentForm.bankAccountId,
          reference: paymentForm.reference.trim() || undefined,
          bills: selectedBills.map((b) => ({ billId: b.id, amount: amountFor(b) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record payment", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${selectedBills.length} bill(s) paid.`);
      setPayOpen(false);
      setPaymentForm(emptyPaymentForm());
      setSelectedIds(new Set());
      router.refresh();
    } finally {
      setPaying(false);
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Vendor bills"
        description="Money the hotel owes suppliers. A bill posts to the ledger once it's approved; below your approval limits that happens automatically."
        actions={
          <>
            {canRecordPayment && selectedIds.size > 0 ? (
              <button
                type="button"
                className={hmsButton.secondary}
                onClick={() => {
                  setPaymentAmounts(Object.fromEntries(selectedBills.map((b) => [b.id, String(remainingFor(b))])));
                  setPayOpen(true);
                }}
              >
                Pay selected ({selectedIds.size})
              </button>
            ) : null}
            {canCreate ? (
              <button
                type="button"
                className={hmsButton.primary}
                onClick={() => setCreateOpen(true)}
                disabled={accounts.length === 0 || vendors.length === 0}
              >
                <Plus className="h-4 w-4" aria-hidden />
                New bill
              </button>
            ) : null}
          </>
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsSectionIntro
        id="accounts-bills"
        meaning="money"
        art="page"
        title="Keeping track of what you owe"
        points={[
          "Record each supplier invoice as a bill so it shows in what you owe.",
          "Bills above your approval limit wait for a manager to approve them.",
          "Tick approved bills, then choose Pay selected when you pay them.",
        ]}
      />

      {vendors.length === 0 ? (
        <HmsEmptyState
          art="page"
          meaning="money"
          title="No active vendors yet"
          description="Bills are recorded against a vendor, so add one in Procurement first."
          action={
            <Link href={`/hms/${slug}/procurement/vendors`} className={hmsButton.primary}>
              Go to vendors
            </Link>
          }
        />
      ) : (
        <HmsCard id="accounts-bills-list" title="Bills" icon={ReceiptText} meaning="money" flush>
          {bills.length === 0 ? (
            <HmsEmptyState
              bare
              art="page"
              meaning="money"
              title="No vendor bills yet"
              description="Bills you record will appear here with what's still to pay on each."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                  <tr>
                    {canRecordPayment ? (
                      <th scope="col" className="w-12 px-5 py-3">
                        <span className="sr-only">Select</span>
                      </th>
                    ) : null}
                    <th scope="col" className="px-5 py-3">Vendor</th>
                    <th scope="col" className="px-5 py-3">Reference</th>
                    <th scope="col" className="px-5 py-3">Department</th>
                    <th scope="col" className="px-5 py-3">Account</th>
                    <th scope="col" className="px-5 py-3 text-right">Total</th>
                    <th scope="col" className="px-5 py-3">Status</th>
                    <th scope="col" className="px-5 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((b) => {
                    const busy = busyIds.has(b.id);
                    const overdue = b.status === "approved" && isPastDue(b.dueDate);
                    return (
                      <tr key={b.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selectedIds.has(b.id) ? "bg-emerald-50/60" : ""}`}>
                        {canRecordPayment ? (
                          <td className="px-5 py-3">
                            {b.status === "approved" ? (
                              <input
                                type="checkbox"
                                className="h-4 w-4 rounded border-slate-300 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                checked={selectedIds.has(b.id)}
                                onChange={() => toggleSelected(b.id)}
                                aria-label={`Select bill from ${b.vendorName} for payment`}
                              />
                            ) : null}
                          </td>
                        ) : null}
                        <td className="px-5 py-3 font-medium text-slate-900">{b.vendorName}</td>
                        <td className="px-5 py-3 text-slate-700">
                          {b.billReference ?? "—"}
                          <p className="text-sm text-slate-600">{formatDateTime(b.createdAt)}</p>
                        </td>
                        <td className="px-5 py-3 text-slate-700">{b.department}</td>
                        <td className="px-5 py-3 text-slate-700">
                          {b.expenseAccountCode} {b.expenseAccountName}
                        </td>
                        <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-900">
                          {b.total.toFixed(2)} {b.currency}
                          {b.amountPaid > 0 && b.status !== "paid" ? (
                            <p className="text-sm font-normal text-amber-800">{remainingFor(b).toFixed(2)} remaining</p>
                          ) : null}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            <HmsPill tone={STATUS_TONE[b.status] ?? "slate"}>{STATUS_LABEL[b.status] ?? b.status}</HmsPill>
                            {overdue ? <HmsPill tone="red">Overdue</HmsPill> : null}
                          </div>
                        </td>
                        <td className="px-5 py-3">
                          {b.status === "pending_approval" && canApprove ? (
                            <div className="flex justify-end gap-2">
                              <Button type="button" size="sm" disabled={busy} onClick={() => void approve(b.id)}>
                                {busy ? "Approving…" : "Approve"}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setRejectTarget(b.id);
                                  setRejectReason("");
                                }}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </HmsCard>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New vendor bill</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-0.5">
            <HmsField id="bill-vendor" label="Vendor">
              <select
                id="bill-vendor"
                className={hmsInput}
                value={form.vendorId}
                onChange={(e) => {
                  const vendor = vendors.find((v) => v.id === e.target.value);
                  setForm((s) => ({ ...s, vendorId: e.target.value, currency: vendor?.currency ?? s.currency }));
                }}
              >
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="bill-department" label="Department">
                <select
                  id="bill-department"
                  className={hmsInput}
                  value={form.department}
                  onChange={(e) => setForm((s) => ({ ...s, department: e.target.value }))}
                >
                  {ACCOUNTS_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </HmsField>
              <HmsField id="bill-reference" label="Bill reference">
                <input
                  id="bill-reference"
                  className={hmsInput}
                  value={form.billReference}
                  onChange={(e) => setForm((s) => ({ ...s, billReference: e.target.value }))}
                  placeholder="Vendor's invoice #"
                />
              </HmsField>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="bill-date" label="Bill date">
                <input id="bill-date" type="date" className={hmsInput} value={form.billDate} onChange={(e) => setForm((s) => ({ ...s, billDate: e.target.value }))} />
              </HmsField>
              <HmsField id="bill-due" label="Due date" optional>
                <input id="bill-due" type="date" className={hmsInput} value={form.dueDate} onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))} />
              </HmsField>
            </div>
            <HmsField id="bill-account" label="Expense / asset account">
              <select
                id="bill-account"
                className={hmsInput}
                value={form.expenseAccountId}
                onChange={(e) => setForm((s) => ({ ...s, expenseAccountId: e.target.value }))}
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <div className="grid grid-cols-3 gap-3">
              <HmsField id="bill-subtotal" label="Subtotal">
                <input
                  id="bill-subtotal"
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${hmsInput} tabular-nums`}
                  value={form.subtotal}
                  onChange={(e) => setForm((s) => ({ ...s, subtotal: e.target.value }))}
                />
              </HmsField>
              <HmsField id="bill-tax" label="Tax">
                <input id="bill-tax" type="number" min="0" step="0.01" className={`${hmsInput} tabular-nums`} value={form.tax} onChange={(e) => setForm((s) => ({ ...s, tax: e.target.value }))} />
              </HmsField>
              <HmsField id="bill-currency" label="Currency">
                <input id="bill-currency" className={hmsInput} value={form.currency} onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value }))} />
              </HmsField>
            </div>
            {form.currency.trim().toUpperCase() !== defaultCurrency.toUpperCase() ? (
              <div>
                <label htmlFor="bill-fx" className="mb-1 block text-sm font-medium text-slate-800">
                  FX rate (1 {form.currency || "?"} → {defaultCurrency})
                </label>
                <input
                  id="bill-fx"
                  type="number"
                  min="0"
                  step="any"
                  className={`${hmsInput} tabular-nums`}
                  aria-describedby="bill-fx-hint"
                  value={form.fxRate}
                  onChange={(e) => setForm((s) => ({ ...s, fxRate: e.target.value }))}
                />
                <p id="bill-fx-hint" className="mt-1 text-sm text-slate-600">
                  Posts to the ledger as {(total * (Number(form.fxRate) || 1)).toFixed(2)} {defaultCurrency}. The ledger has no
                  separate currency of its own, so this is what reaches the trial balance.
                </p>
              </div>
            ) : null}
            <HmsField id="bill-notes" label="Notes" optional>
              <textarea
                id="bill-notes"
                className={`${hmsInput} min-h-[64px]`}
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </HmsField>
            <p className="flex items-center justify-between rounded-xl border-t-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold tabular-nums text-slate-900">
              <span>Total</span>
              <span>
                {total.toFixed(2)} {form.currency}
              </span>
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submitCreate()}>
              {saving ? "Saving…" : "Create bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejectTarget != null} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reject vendor bill</DialogTitle>
          </DialogHeader>
          <HmsField id="bill-reject-reason" label="Reason" hint="The person who recorded the bill will see this.">
            <textarea
              id="bill-reject-reason"
              className={`${hmsInput} min-h-[80px]`}
              aria-describedby="bill-reject-reason-hint"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this bill being rejected?"
            />
          </HmsField>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button type="button" variant="outline" disabled={rejecting} onClick={() => void submitReject()}>
              {rejecting ? "Rejecting…" : "Reject bill"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Pay {selectedBills.length} vendor bill{selectedBills.length === 1 ? "" : "s"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {selectedBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {b.vendorName} {b.billReference ? `· ${b.billReference}` : ""}
                    </p>
                    <p id={`payment-${b.id}-hint`} className="text-sm tabular-nums text-slate-600">
                      {b.amountPaid > 0
                        ? `${remainingFor(b).toFixed(2)} remaining of ${b.total.toFixed(2)} ${b.currency}`
                        : `${b.total.toFixed(2)} ${b.currency}`}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    max={remainingFor(b)}
                    step="0.01"
                    aria-label={`Amount to pay ${b.vendorName}${b.billReference ? ` (${b.billReference})` : ""}`}
                    aria-describedby={`payment-${b.id}-hint`}
                    className="h-10 w-28 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm tabular-nums focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={paymentAmounts[b.id] ?? String(remainingFor(b))}
                    onChange={(e) => setPaymentAmounts((s) => ({ ...s, [b.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              Each amount starts at the full remaining balance. Lower it for a part payment; the bill stays open until it&apos;s fully paid.
            </p>
            <HmsField id="payment-account" label="Pay from">
              <select
                id="payment-account"
                className={hmsInput}
                value={paymentForm.bankAccountId}
                onChange={(e) => setPaymentForm((s) => ({ ...s, bankAccountId: e.target.value }))}
              >
                <option value="">Select account…</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} {a.name}
                  </option>
                ))}
              </select>
            </HmsField>
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="payment-date" label="Payment date">
                <input
                  id="payment-date"
                  type="date"
                  className={hmsInput}
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, paymentDate: e.target.value }))}
                />
              </HmsField>
              <HmsField id="payment-reference" label="Reference" optional>
                <input
                  id="payment-reference"
                  className={hmsInput}
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="Transfer/cheque ref"
                />
              </HmsField>
            </div>
            <p className="flex items-center justify-between rounded-xl border-t-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold tabular-nums text-slate-900">
              <span>Total to pay</span>
              <span>{selectedTotal.toFixed(2)}</span>
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPayOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={paying} onClick={() => void submitPayment()}>
              {paying ? "Paying…" : "Confirm payment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </HmsPage>
  );
}
