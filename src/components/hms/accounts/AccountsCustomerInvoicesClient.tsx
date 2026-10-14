"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import type { ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import { ACCOUNTS_DEPARTMENTS } from "@/lib/hms/journal-entries";
import type { CustomerInvoiceRow } from "@/lib/hms/customer-invoices";
import type { ArCustomerRow } from "@/lib/hms/ar-customers";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { FileText, Plus } from "lucide-react";

type InHouseGuestOption = { reservationId: string; guestName: string; roomCode: string | null; confirmationCode: string; isOverdue: boolean };

const STATUS_LABEL: Record<string, string> = { open: "Open", paid: "Paid", cancelled: "Cancelled" };
const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = { open: "amber", paid: "green", cancelled: "slate" };

function isPastDue(dueDate: string | null) {
  return !!dueDate && dueDate.slice(0, 10) < new Date().toISOString().slice(0, 10);
}

function emptyInvoiceForm(defaultDepartment: string, defaultCurrency: string) {
  return {
    customerId: "",
    reservationId: "",
    department: defaultDepartment,
    invoiceDate: new Date().toISOString().slice(0, 10),
    dueDate: "",
    currency: defaultCurrency,
    fxRate: "1",
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
  defaultCurrency = "NGN",
}: {
  slug: string;
  invoices: CustomerInvoiceRow[];
  accounts: ChartOfAccountRow[];
  customers: ArCustomerRow[];
  canCreate: boolean;
  canManageCustomers: boolean;
  canReceivePayment: boolean;
  canAccessAllDepartments: boolean;
  defaultCurrency?: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(() => emptyInvoiceForm(ACCOUNTS_DEPARTMENTS[0], defaultCurrency));
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
  const [receiptAmounts, setReceiptAmounts] = useState<Record<string, string>>({});

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
          fxRate: Number(form.fxRate) || 1,
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
      setForm(emptyInvoiceForm(ACCOUNTS_DEPARTMENTS[0], defaultCurrency));
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
  const remainingFor = (i: CustomerInvoiceRow) => Math.max(0, Math.round((i.total - i.amountReceived) * 100) / 100);
  const amountFor = (i: CustomerInvoiceRow) => Number(receiptAmounts[i.id] ?? remainingFor(i)) || 0;
  const selectedTotal = selectedInvoices.reduce((sum, i) => sum + amountFor(i), 0);

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
          invoices: selectedInvoices.map((i) => ({ invoiceId: i.id, amount: amountFor(i) })),
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
      setReceiptAmounts({});
      setSelectedIds(new Set());
      router.refresh();
    } finally {
      setReceiving(false);
    }
  };

  return (
    <HmsPage wide>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Customer invoices"
        description="Money owed to the hotel. An invoice posts to the ledger as soon as it's created; there's no approval step."
        actions={
          <>
            {canReceivePayment && selectedIds.size > 0 ? (
              <button
                type="button"
                className={hmsButton.secondary}
                onClick={() => {
                  setReceiptAmounts(Object.fromEntries(selectedInvoices.map((i) => [i.id, String(remainingFor(i))])));
                  setReceiveOpen(true);
                }}
              >
                Receive selected ({selectedIds.size})
              </button>
            ) : null}
            {canCreate ? (
              <button type="button" className={hmsButton.primary} onClick={openCreate} disabled={accounts.length === 0}>
                <Plus className="h-4 w-4" aria-hidden />
                New invoice
              </button>
            ) : null}
          </>
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsSectionIntro
        id="accounts-invoices"
        meaning="money"
        art="page"
        title="Billing companies and guests on account"
        points={[
          "Create an invoice for anyone who pays later, such as a company or travel agent.",
          "Tick open invoices, then choose Receive selected when the money arrives.",
          "Part payments are fine: the invoice stays open until it's fully paid.",
        ]}
      />

      <HmsCard id="accounts-invoices-list" title="Invoices" icon={FileText} meaning="money" flush>
        {invoices.length === 0 ? (
          <HmsEmptyState
            bare
            art="page"
            meaning="money"
            title="No customer invoices yet"
            description="Invoices you create will appear here with what's still owed on each."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                <tr>
                  {canReceivePayment ? (
                    <th scope="col" className="w-12 px-5 py-3">
                      <span className="sr-only">Select</span>
                    </th>
                  ) : null}
                  <th scope="col" className="px-5 py-3">Invoice</th>
                  <th scope="col" className="px-5 py-3">Customer</th>
                  <th scope="col" className="px-5 py-3">Stay</th>
                  <th scope="col" className="px-5 py-3">Department</th>
                  <th scope="col" className="px-5 py-3 text-right">Total</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => {
                  const overdue = i.status === "open" && isPastDue(i.dueDate);
                  return (
                    <tr key={i.id} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50 ${selectedIds.has(i.id) ? "bg-emerald-50/60" : ""}`}>
                      {canReceivePayment ? (
                        <td className="px-5 py-3">
                          {i.status === "open" ? (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-slate-300 accent-emerald-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                              checked={selectedIds.has(i.id)}
                              onChange={() => toggleSelected(i.id)}
                              aria-label={`Select invoice ${i.invoiceNumber} for receipt`}
                            />
                          ) : null}
                        </td>
                      ) : null}
                      <td className="px-5 py-3 font-medium text-slate-900">
                        {i.invoiceNumber}
                        <p className="text-sm font-normal text-slate-600">{formatDateTime(i.createdAt)}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-700">{i.customerName}</td>
                      <td className="px-5 py-3 text-slate-700">{i.confirmationCode ?? "—"}</td>
                      <td className="px-5 py-3 text-slate-700">{i.department}</td>
                      <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-slate-900">
                        {i.total.toFixed(2)} {i.currency}
                        {i.amountReceived > 0 && i.status !== "paid" ? (
                          <p className="text-sm font-normal text-amber-800">{remainingFor(i).toFixed(2)} remaining</p>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          <HmsPill tone={STATUS_TONE[i.status] ?? "slate"}>{STATUS_LABEL[i.status] ?? i.status}</HmsPill>
                          {overdue ? <HmsPill tone="red">Overdue</HmsPill> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New customer invoice</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto px-0.5">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="inv-customer" className="text-sm font-medium text-slate-800">
                  Customer
                </label>
                {canManageCustomers ? (
                  <button
                    type="button"
                    className={hmsButton.quiet}
                    aria-expanded={addingCustomer}
                    onClick={() => setAddingCustomer((v) => !v)}
                  >
                    {addingCustomer ? "Cancel" : (
                      <>
                        <Plus className="h-4 w-4" aria-hidden />
                        New customer
                      </>
                    )}
                  </button>
                ) : null}
              </div>
              {addingCustomer ? (
                <div className="mb-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <HmsField id="inv-new-customer-name" label="Customer name">
                    <input
                      id="inv-new-customer-name"
                      className={hmsInput}
                      value={customerForm.name}
                      onChange={(e) => setCustomerForm((s) => ({ ...s, name: e.target.value }))}
                    />
                  </HmsField>
                  <div className="grid grid-cols-2 gap-3">
                    <HmsField id="inv-new-customer-contact" label="Contact name" optional>
                      <input
                        id="inv-new-customer-contact"
                        className={hmsInput}
                        value={customerForm.contactName}
                        onChange={(e) => setCustomerForm((s) => ({ ...s, contactName: e.target.value }))}
                      />
                    </HmsField>
                    <HmsField id="inv-new-customer-phone" label="Phone" optional>
                      <input
                        id="inv-new-customer-phone"
                        type="tel"
                        className={hmsInput}
                        value={customerForm.phone}
                        onChange={(e) => setCustomerForm((s) => ({ ...s, phone: e.target.value }))}
                      />
                    </HmsField>
                  </div>
                  <button type="button" className={hmsButton.primary} disabled={savingCustomer} onClick={() => void submitCustomer()}>
                    {savingCustomer ? "Adding…" : "Add customer"}
                  </button>
                </div>
              ) : (
                <select
                  id="inv-customer"
                  className={hmsInput}
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
            <HmsField id="inv-stay" label="Related stay" optional hint="Linking a stay fills in its city-ledger balance.">
              <select
                id="inv-stay"
                className={hmsInput}
                aria-describedby="inv-stay-hint"
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
            </HmsField>
            {balanceLoading ? (
              <p role="status" className="-mt-2 text-sm text-slate-600">
                Checking city-ledger balance…
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="inv-department" label="Department">
                <select
                  id="inv-department"
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
              <HmsField id="inv-date" label="Invoice date">
                <input id="inv-date" type="date" className={hmsInput} value={form.invoiceDate} onChange={(e) => setForm((s) => ({ ...s, invoiceDate: e.target.value }))} />
              </HmsField>
            </div>
            <HmsField id="inv-due" label="Due date" optional>
              <input id="inv-due" type="date" className={hmsInput} value={form.dueDate} onChange={(e) => setForm((s) => ({ ...s, dueDate: e.target.value }))} />
            </HmsField>
            <HmsField id="inv-revenue-account" label="Revenue account">
              <select
                id="inv-revenue-account"
                className={hmsInput}
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
            </HmsField>
            <div className="grid grid-cols-3 gap-3">
              <HmsField id="inv-subtotal" label="Subtotal">
                <input
                  id="inv-subtotal"
                  type="number"
                  min="0"
                  step="0.01"
                  className={`${hmsInput} tabular-nums`}
                  value={form.subtotal}
                  onChange={(e) => setForm((s) => ({ ...s, subtotal: e.target.value }))}
                />
              </HmsField>
              <HmsField id="inv-tax" label="Tax">
                <input id="inv-tax" type="number" min="0" step="0.01" className={`${hmsInput} tabular-nums`} value={form.tax} onChange={(e) => setForm((s) => ({ ...s, tax: e.target.value }))} />
              </HmsField>
              <HmsField id="inv-currency" label="Currency">
                <input id="inv-currency" className={hmsInput} value={form.currency} onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value }))} />
              </HmsField>
            </div>
            {form.currency.trim().toUpperCase() !== defaultCurrency.toUpperCase() ? (
              <div>
                <label htmlFor="inv-fx" className="mb-1 block text-sm font-medium text-slate-800">
                  FX rate (1 {form.currency || "?"} → {defaultCurrency})
                </label>
                <input
                  id="inv-fx"
                  type="number"
                  min="0"
                  step="any"
                  className={`${hmsInput} tabular-nums`}
                  aria-describedby="inv-fx-hint"
                  value={form.fxRate}
                  onChange={(e) => setForm((s) => ({ ...s, fxRate: e.target.value }))}
                />
                <p id="inv-fx-hint" className="mt-1 text-sm text-slate-600">
                  Posts to the ledger as {(total * (Number(form.fxRate) || 1)).toFixed(2)} {defaultCurrency}. The ledger has no
                  separate currency of its own, so this is what reaches the trial balance.
                </p>
              </div>
            ) : null}
            <HmsField id="inv-notes" label="Notes" optional>
              <textarea
                id="inv-notes"
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
          <div className="space-y-4">
            <div className="max-h-52 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {selectedInvoices.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {i.invoiceNumber} · {i.customerName}
                    </p>
                    <p id={`receipt-${i.id}-hint`} className="text-sm tabular-nums text-slate-600">
                      {i.amountReceived > 0
                        ? `${remainingFor(i).toFixed(2)} remaining of ${i.total.toFixed(2)} ${i.currency}`
                        : `${i.total.toFixed(2)} ${i.currency}`}
                    </p>
                  </div>
                  <input
                    type="number"
                    min="0.01"
                    max={remainingFor(i)}
                    step="0.01"
                    aria-label={`Amount received for ${i.invoiceNumber}`}
                    aria-describedby={`receipt-${i.id}-hint`}
                    className="h-10 w-28 rounded-lg border border-slate-300 bg-white px-2 text-right text-sm tabular-nums focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={receiptAmounts[i.id] ?? String(remainingFor(i))}
                    onChange={(e) => setReceiptAmounts((s) => ({ ...s, [i.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <p className="text-sm text-slate-600">
              Each amount starts at the full remaining balance. Lower it for a part payment; the invoice stays open until it&apos;s fully paid.
            </p>
            <HmsField id="receipt-account" label="Deposit into">
              <select
                id="receipt-account"
                className={hmsInput}
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
            </HmsField>
            <div className="grid grid-cols-2 gap-3">
              <HmsField id="receipt-date" label="Payment date">
                <input
                  id="receipt-date"
                  type="date"
                  className={hmsInput}
                  value={receiptForm.paymentDate}
                  onChange={(e) => setReceiptForm((s) => ({ ...s, paymentDate: e.target.value }))}
                />
              </HmsField>
              <HmsField id="receipt-reference" label="Reference" optional>
                <input
                  id="receipt-reference"
                  className={hmsInput}
                  value={receiptForm.reference}
                  onChange={(e) => setReceiptForm((s) => ({ ...s, reference: e.target.value }))}
                  placeholder="Transfer/cheque ref"
                />
              </HmsField>
            </div>
            <p className="flex items-center justify-between rounded-xl border-t-2 border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold tabular-nums text-slate-900">
              <span>Total to receive</span>
              <span>{selectedTotal.toFixed(2)}</span>
            </p>
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
    </HmsPage>
  );
}
