"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import { ACCOUNTS_DEPARTMENTS } from "@/lib/hms/journal-entries";
import type { VendorBillRow } from "@/lib/hms/vendor-bills";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

type VendorOption = { id: string; name: string; currency: string };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  paid: "Paid",
};

function emptyForm(defaultDepartment: string) {
  return {
    vendorId: "",
    department: defaultDepartment,
    billReference: "",
    billDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currency: "NGN",
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
}: {
  slug: string;
  bills: VendorBillRow[];
  accounts: ChartOfAccountRow[];
  vendors: VendorOption[];
  canCreate: boolean;
  canApprove: boolean;
  canRecordPayment: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => emptyForm(ACCOUNTS_DEPARTMENTS[0]));
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
  const selectedTotal = selectedBills.reduce((sum, b) => sum + b.total, 0);

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
      setForm(emptyForm(ACCOUNTS_DEPARTMENTS[0]));
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
          billIds: selectedBills.map((b) => b.id),
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
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Vendor bills</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Accounts Payable. A bill posts to the ledger once approved — below every configured threshold, that happens automatically.
          </p>
        </div>
        <div className="flex gap-2">
          {canRecordPayment && selectedIds.size > 0 ? (
            <Button type="button" variant="outline" onClick={() => setPayOpen(true)}>
              Pay selected ({selectedIds.size})
            </Button>
          ) : null}
          {canCreate ? (
            <Button type="button" onClick={() => setCreateOpen(true)} disabled={accounts.length === 0 || vendors.length === 0}>
              New bill
            </Button>
          ) : null}
        </div>
      </div>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {vendors.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          No active vendors yet — add one in Procurement → Vendors first.
        </div>
      ) : bills.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No vendor bills yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  {canRecordPayment ? <th className="px-4 py-3" /> : null}
                  <th className="px-4 py-3">Vendor</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {bills.map((b) => {
                  const busy = busyIds.has(b.id);
                  return (
                    <tr key={b.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                      {canRecordPayment ? (
                        <td className="px-4 py-2.5">
                          {b.status === "approved" ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.has(b.id)}
                              onChange={() => toggleSelected(b.id)}
                              aria-label={`Select bill from ${b.vendorName} for payment`}
                            />
                          ) : null}
                        </td>
                      ) : null}
                      <td className="px-4 py-2.5 font-medium text-slate-900">{b.vendorName}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {b.billReference ?? "—"}
                        <p className="text-xs text-slate-400">{formatDateTime(b.createdAt)}</p>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{b.department}</td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {b.expenseAccountCode} {b.expenseAccountName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">
                        {b.total.toFixed(2)} {b.currency}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            b.status === "approved" && "bg-emerald-100 text-emerald-900",
                            b.status === "paid" && "bg-emerald-100 text-emerald-900",
                            b.status === "rejected" && "bg-red-100 text-red-800",
                            b.status === "cancelled" && "bg-slate-200 text-slate-700",
                            b.status === "pending_approval" && "bg-amber-100 text-amber-900",
                            b.status === "draft" && "bg-slate-100 text-slate-700",
                          )}
                        >
                          {STATUS_LABEL[b.status] ?? b.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {b.status === "pending_approval" && canApprove ? (
                          <div className="flex gap-2">
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
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New vendor bill</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Vendor</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Department</p>
                <select
                  className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                  value={form.department}
                  onChange={(e) => setForm((s) => ({ ...s, department: e.target.value }))}
                >
                  {ACCOUNTS_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Bill reference</p>
                <Input
                  value={form.billReference}
                  onChange={(e) => setForm((s) => ({ ...s, billReference: e.target.value }))}
                  placeholder="Vendor's invoice #"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Bill date</p>
                <Input type="date" value={form.billDate} onChange={(e) => setForm((s) => ({ ...s, billDate: e.target.value }))} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Due date (optional)</p>
                <Input type="date" value={form.dueDate} onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Expense / asset account</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
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
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Subtotal</p>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.subtotal}
                  onChange={(e) => setForm((s) => ({ ...s, subtotal: e.target.value }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Tax</p>
                <Input type="number" min="0" step="0.01" value={form.tax} onChange={(e) => setForm((s) => ({ ...s, tax: e.target.value }))} />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Currency</p>
                <Input value={form.currency} onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value }))} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Notes (optional)</p>
              <textarea
                className="min-h-[64px] w-full rounded-lg border border-input px-3 py-2 text-sm"
                value={form.notes}
                onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <p className="text-sm font-medium tabular-nums text-slate-700">Total: {total.toFixed(2)} {form.currency}</p>
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
          <div>
            <p className="mb-1 text-xs font-medium text-slate-600">Reason</p>
            <textarea
              className="min-h-[80px] w-full rounded-lg border border-input px-3 py-2 text-sm"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Why is this bill being rejected?"
            />
          </div>
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
          <div className="space-y-3">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {selectedBills.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    {b.vendorName} {b.billReference ? `· ${b.billReference}` : ""}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {b.total.toFixed(2)} {b.currency}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Pay from</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Payment date</p>
                <Input
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, paymentDate: e.target.value }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Reference (optional)</p>
                <Input
                  value={paymentForm.reference}
                  onChange={(e) => setPaymentForm((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="Transfer/cheque ref"
                />
              </div>
            </div>
            <p className="text-sm font-medium tabular-nums text-slate-700">Total to pay: {selectedTotal.toFixed(2)}</p>
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
    </div>
  );
}
