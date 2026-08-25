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
import type { CustomerInvoiceRow } from "@/lib/hms/customer-invoices";
import type { ArCustomerRow } from "@/lib/hms/ar-customers";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

type InHouseGuestOption = { reservationId: string; guestName: string; roomCode: string | null; confirmationCode: string; isOverdue: boolean };

const STATUS_LABEL: Record<string, string> = { open: "Open", paid: "Paid", cancelled: "Cancelled" };

function emptyInvoiceForm(defaultDepartment: string) {
  return {
    customerId: "",
    reservationId: "",
    department: defaultDepartment,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currency: "NGN",
    revenueAccountId: "",
    subtotal: "",
    tax: "",
    notes: "",
  };
}

function emptyCustomerForm() {
  return { name: "", contactName: "", phone: "", email: "", currency: "NGN", paymentTerms: "" };
}

function emptyReceiptForm() {
  return { bankAccountId: "", paymentDate: new Date().toISOString().slice(0, 10), reference: "" };
}

export function AccountsCustomerInvoicesClient({
  slug,
  invoices,
  accounts,
  customers,
  canCreate,
  canManageCustomers,
  canReceivePayment,
  canAccessAllDepartments,
}: {
  slug: string;
  invoices: CustomerInvoiceRow[];
  accounts: ChartOfAccountRow[];
  customers: ArCustomerRow[];
  canCreate: boolean;
  canManageCustomers: boolean;
  canReceivePayment: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => emptyInvoiceForm(ACCOUNTS_DEPARTMENTS[0]));
  const [saving, setSaving] = useState(false);

  const [customerList, setCustomerList] = useState(customers);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [customerForm, setCustomerForm] = useState(emptyCustomerForm);
  const [savingCustomer, setSavingCustomer] = useState(false);

  const [guests, setGuests] = useState<InHouseGuestOption[]>([]);
  const [guestsLoading, setGuestsLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiptForm, setReceiptForm] = useState(emptyReceiptForm);
  const [receiving, setReceiving] = useState(false);

  const openCreate = () => {
    setCreateOpen(true);
    setGuestsLoading(true);
    fetch(`/api/hotel/frontdesk/guest-services/in-house?${new URLSearchParams({ slug })}`)
      .then((res) => res.json())
      .then((json: { guests?: InHouseGuestOption[]; error?: string }) => {
        if (!json.error) setGuests(json.guests ?? []);
      })
      .finally(() => setGuestsLoading(false));
  };

  const selectReservation = async (reservationId: string) => {
    setForm((s) => ({ ...s, reservationId }));
    if (!reservationId) return;
    setBalanceLoading(true);
    try {
      const res = await fetch(
        `/api/hotel/accounts/customer-invoices/folio-balance?${new URLSearchParams({ slug, reservationId })}`,
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && typeof data.companyLegBalance === "number" && data.companyLegBalance > 0) {
        setForm((s) => ({ ...s, subtotal: String(data.companyLegBalance) }));
        toastSuccess(`Pre-filled ${data.companyLegBalance.toFixed(2)} from this stay's city-ledger balance.`);
      }
    } finally {
      setBalanceLoading(false);
    }
  };

  const subtotal = Number(form.subtotal) || 0;
  const tax = Number(form.tax) || 0;
  const total = subtotal + tax;

  const submitCreate = async () => {
    if (!form.customerId) {
      toastError("Customer required", "Select which customer this invoice is billed to.");
      return;
    }
    if (!form.revenueAccountId) {
      toastError("Account required", "Select which revenue account this invoice posts to.");
      return;
    }
    if (total <= 0) {
      toastError("Amount required", "Enter a subtotal greater than zero.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/accounts/customer-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          customerId: form.customerId,
          reservationId: form.reservationId || undefined,
          department: form.department,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate || undefined,
          currency: form.currency,
          revenueAccountId: form.revenueAccountId,
          subtotal,
          tax,
          notes: form.notes.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create invoice", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`Invoice ${data.invoiceNumber} created and posted to the ledger.`);
      setCreateOpen(false);
      setForm(emptyInvoiceForm(ACCOUNTS_DEPARTMENTS[0]));
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const submitCustomer = async () => {
    if (!customerForm.name.trim()) {
      toastError("Name required", "Enter the customer's name.");
      return;
    }
    setSavingCustomer(true);
    try {
      const res = await fetch("/api/hotel/accounts/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          name: customerForm.name.trim(),
          contactName: customerForm.contactName.trim() || undefined,
          phone: customerForm.phone.trim() || undefined,
          email: customerForm.email.trim() || undefined,
          currency: customerForm.currency,
          paymentTerms: customerForm.paymentTerms.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add customer", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Customer added.");
      setCustomerList((prev) =>
        [...prev, { id: data.id, name: customerForm.name.trim(), contactName: null, phone: null, email: null, address: null, currency: customerForm.currency, paymentTerms: null, creditLimit: null, status: "active" as const, notes: null, createdAt: "", updatedAt: "" }].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setForm((s) => ({ ...s, customerId: data.id }));
      setAddingCustomer(false);
      setCustomerForm(emptyCustomerForm());
    } finally {
      setSavingCustomer(false);
    }
  };

  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedInvoices = invoices.filter((i) => selectedIds.has(i.id));
  const selectedTotal = selectedInvoices.reduce((sum, i) => sum + i.total, 0);

  const submitReceive = async () => {
    if (!receiptForm.bankAccountId) {
      toastError("Account required", "Select which account is receiving this payment.");
      return;
    }
    if (selectedInvoices.length === 0) return;
    setReceiving(true);
    try {
      const res = await fetch("/api/hotel/accounts/customer-invoice-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          paymentDate: receiptForm.paymentDate,
          bankAccountId: receiptForm.bankAccountId,
          reference: receiptForm.reference.trim() || undefined,
          invoiceIds: selectedInvoices.map((i) => i.id),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record receipt", data.error ?? "Try again.");
        return;
      }
      toastSuccess(`${selectedInvoices.length} invoice(s) received.`);
      setReceiveOpen(false);
      setReceiptForm(emptyReceiptForm());
      setSelectedIds(new Set());
      router.refresh();
    } finally {
      setReceiving(false);
    }
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Customer invoices</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Accounts Receivable. An invoice posts to the ledger the moment it&apos;s created — there&apos;s no approval step.
          </p>
        </div>
        <div className="flex gap-2">
          {canReceivePayment && selectedIds.size > 0 ? (
            <Button type="button" variant="outline" onClick={() => setReceiveOpen(true)}>
              Receive selected ({selectedIds.size})
            </Button>
          ) : null}
          {canCreate ? (
            <Button type="button" onClick={openCreate} disabled={accounts.length === 0}>
              New invoice
            </Button>
          ) : null}
        </div>
      </div>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {invoices.length === 0 ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No customer invoices yet.
        </div>
      ) : (
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  {canReceivePayment ? <th className="px-4 py-3" /> : null}
                  <th className="px-4 py-3">Invoice</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Stay</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/80">
                    {canReceivePayment ? (
                      <td className="px-4 py-2.5">
                        {i.status === "open" ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(i.id)}
                            onChange={() => toggleSelected(i.id)}
                            aria-label={`Select invoice ${i.invoiceNumber} for receipt`}
                          />
                        ) : null}
                      </td>
                    ) : null}
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {i.invoiceNumber}
                      <p className="text-xs text-slate-400">{formatDateTime(i.createdAt)}</p>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{i.customerName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{i.confirmationCode ?? "—"}</td>
                    <td className="px-4 py-2.5 text-slate-600">{i.department}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-slate-700">
                      {i.total.toFixed(2)} {i.currency}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-semibold",
                          i.status === "paid" && "bg-emerald-100 text-emerald-900",
                          i.status === "cancelled" && "bg-slate-200 text-slate-700",
                          i.status === "open" && "bg-amber-100 text-amber-900",
                        )}
                      >
                        {STATUS_LABEL[i.status] ?? i.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New customer invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600">Customer</p>
                {canManageCustomers ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-blue-700 underline"
                    onClick={() => setAddingCustomer((v) => !v)}
                  >
                    {addingCustomer ? "Cancel" : "+ New customer"}
                  </button>
                ) : null}
              </div>
              {addingCustomer ? (
                <div className="mb-2 space-y-2 rounded-lg border border-slate-200 p-3">
                  <Input
                    placeholder="Customer name"
                    value={customerForm.name}
                    onChange={(e) => setCustomerForm((s) => ({ ...s, name: e.target.value }))}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Contact name"
                      value={customerForm.contactName}
                      onChange={(e) => setCustomerForm((s) => ({ ...s, contactName: e.target.value }))}
                    />
                    <Input
                      placeholder="Phone"
                      value={customerForm.phone}
                      onChange={(e) => setCustomerForm((s) => ({ ...s, phone: e.target.value }))}
                    />
                  </div>
                  <Button type="button" size="sm" disabled={savingCustomer} onClick={() => void submitCustomer()}>
                    {savingCustomer ? "Adding…" : "Add customer"}
                  </Button>
                </div>
              ) : (
                <select
                  className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                  value={form.customerId}
                  onChange={(e) => setForm((s) => ({ ...s, customerId: e.target.value }))}
                >
                  <option value="">Select customer…</option>
                  {customerList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Related stay (optional)</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                value={form.reservationId}
                onChange={(e) => void selectReservation(e.target.value)}
                disabled={guestsLoading}
              >
                <option value="">{guestsLoading ? "Loading guests…" : "Not linked to a stay"}</option>
                {guests.map((g) => (
                  <option key={g.reservationId} value={g.reservationId}>
                    {g.roomCode ? `Rm ${g.roomCode} · ` : ""}
                    {g.guestName} ({g.confirmationCode})
                    {g.isOverdue ? " — overdue checkout" : ""}
                  </option>
                ))}
              </select>
              {balanceLoading ? <p className="mt-1 text-xs text-slate-400">Checking city-ledger balance…</p> : null}
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
                <p className="mb-1 text-xs font-medium text-slate-600">Invoice date</p>
                <Input type="date" value={form.invoiceDate} onChange={(e) => setForm((s) => ({ ...s, invoiceDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Due date (optional)</p>
              <Input type="date" value={form.dueDate} onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))} />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Revenue account</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                value={form.revenueAccountId}
                onChange={(e) => setForm((s) => ({ ...s, revenueAccountId: e.target.value }))}
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
            <p className="text-sm font-medium tabular-nums text-slate-700">
              Total: {total.toFixed(2)} {form.currency}
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void submitCreate()}>
              {saving ? "Saving…" : "Create invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={receiveOpen} onOpenChange={setReceiveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Receive {selectedInvoices.length} invoice{selectedInvoices.length === 1 ? "" : "s"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {selectedInvoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between text-xs">
                  <span className="text-slate-700">
                    {i.invoiceNumber} · {i.customerName}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {i.total.toFixed(2)} {i.currency}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Deposit into</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                value={receiptForm.bankAccountId}
                onChange={(e) => setReceiptForm((s) => ({ ...s, bankAccountId: e.target.value }))}
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
                  value={receiptForm.paymentDate}
                  onChange={(e) => setReceiptForm((s) => ({ ...s, paymentDate: e.target.value }))}
                />
              </div>
              <div>
                <p className="mb-1 text-xs font-medium text-slate-600">Reference (optional)</p>
                <Input
                  value={receiptForm.reference}
                  onChange={(e) => setReceiptForm((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="Transfer/cheque ref"
                />
              </div>
            </div>
            <p className="text-sm font-medium tabular-nums text-slate-700">Total to receive: {selectedTotal.toFixed(2)}</p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReceiveOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={receiving} onClick={() => void submitReceive()}>
              {receiving ? "Receiving…" : "Confirm receipt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
