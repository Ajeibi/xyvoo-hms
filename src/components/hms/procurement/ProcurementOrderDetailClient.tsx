"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, Info, Receipt, Send, ShoppingCart, Truck, X } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { PurchaseOrderStatus, PurchaseOrderWithLines } from "@/lib/hms/procurement-types";

const STATUS_PILL: Record<PurchaseOrderStatus, { label: string; tone: "slate" | "green" | "amber" | "red" | "blue" }> = {
  draft: { label: "Draft", tone: "slate" },
  pending_approval: { label: "Waiting for approval", tone: "amber" },
  approved: { label: "Approved", tone: "green" },
  ordered: { label: "Ordered", tone: "blue" },
  partially_received: { label: "Partly received", tone: "blue" },
  received: { label: "Received", tone: "green" },
  closed: { label: "Closed", tone: "slate" },
  rejected: { label: "Rejected", tone: "red" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export function ProcurementOrderDetailClient({
  slug,
  order,
  canApprove,
}: {
  slug: string;
  order: PurchaseOrderWithLines;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [invoiceOpen, setInvoiceOpen] = useState(false);

  const patch = async (path: string, body: Record<string, unknown> = {}, successMsg?: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/procurement/orders/${order.id}/${path}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Action failed", data.error ?? "Try again.");
        return;
      }
      if (successMsg) toastSuccess(successMsg);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const status = STATUS_PILL[order.status];
  const hasActions =
    (order.status === "pending_approval" && canApprove) ||
    ["approved", "ordered", "partially_received", "draft", "pending_approval"].includes(order.status) ||
    (!order.invoice_number && ["received", "closed"].includes(order.status));

  return (
    <HmsPage>
      <Link
        href={`/hms/${slug}/procurement/orders`}
        className="inline-flex items-center gap-1 rounded text-sm font-medium text-slate-700 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to purchase orders
      </Link>

      <HmsPageHeader
        eyebrow="Procurement"
        meaning="stock"
        title={order.po_number}
        description={
          <>
            {order.vendor_name} · {order.department}
            {order.fx_rate !== 1 ? ` · Exchange rate 1 ${order.currency} = ${order.fx_rate}` : ""}
          </>
        }
        actions={<HmsPill tone={status.tone}>{status.label}</HmsPill>}
      />

      {order.is_manual ? (
        <p className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Manual PO:</span> {order.manual_reason}
          </span>
        </p>
      ) : null}
      {order.status === "rejected" && order.rejection_reason ? (
        <p className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="font-semibold">Rejected:</span> {order.rejection_reason}
          </span>
        </p>
      ) : null}

      {hasActions ? (
        <div className="flex flex-wrap gap-2">
          {order.status === "pending_approval" && canApprove ? (
            <>
              <button type="button" disabled={busy} className={hmsButton.primary} onClick={() => void patch("approve", {}, `${order.po_number} approved`)}>
                <Check className="h-4 w-4" aria-hidden /> Approve
              </button>
              <button
                type="button"
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-rose-300 bg-white px-4 py-2.5 text-sm font-medium text-rose-700 shadow-sm hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => setRejectOpen(true)}
              >
                <X className="h-4 w-4" aria-hidden /> Reject
              </button>
            </>
          ) : null}
          {order.status === "approved" ? (
            <button type="button" disabled={busy} className={hmsButton.primary} onClick={() => void patch("mark-ordered", {}, "Marked as sent to vendor")}>
              <Send className="h-4 w-4" aria-hidden /> Mark as ordered
            </button>
          ) : null}
          {order.status === "ordered" || order.status === "partially_received" ? (
            <Link href={`/hms/${slug}/procurement/receiving?poId=${order.id}`} className={hmsButton.secondary}>
              <Truck className="h-4 w-4" aria-hidden /> Receive goods
            </Link>
          ) : null}
          {!order.invoice_number && ["ordered", "partially_received", "received", "closed"].includes(order.status) ? (
            <button type="button" disabled={busy} className={hmsButton.secondary} onClick={() => setInvoiceOpen(true)}>
              <Receipt className="h-4 w-4" aria-hidden /> Record invoice
            </button>
          ) : null}
          {["draft", "pending_approval", "approved", "ordered"].includes(order.status) ? (
            <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => void patch("cancel", {}, "Purchase order cancelled")}>
              Cancel order
            </button>
          ) : null}
        </div>
      ) : null}

      <HmsCard id="po-lines" title="Line items" icon={ShoppingCart} meaning="stock" flush>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-sm font-medium text-slate-600">
                <th scope="col" className="px-5 py-3 font-medium sm:px-6">Item</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Quantity</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Unit cost</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Received</th>
                <th scope="col" className="px-5 py-3 text-right font-medium sm:px-6">Line total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {order.lines.map((l) => (
                <tr key={l.id}>
                  <td className="px-5 py-3 text-slate-900 sm:px-6">{l.description}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{l.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{formatPricingAmount(l.unit_cost, order.currency)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-700">{l.quantity_received}</td>
                  <td className="px-5 py-3 text-right font-medium tabular-nums text-slate-900 sm:px-6">{formatPricingAmount(l.line_total, order.currency)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-slate-200 text-slate-700">
                <th scope="row" colSpan={4} className="px-5 py-2 text-right font-medium sm:px-6">Subtotal</th>
                <td className="px-5 py-2 text-right tabular-nums sm:px-6">{formatPricingAmount(order.subtotal, order.currency)}</td>
              </tr>
              <tr className="text-slate-700">
                <th scope="row" colSpan={4} className="px-5 py-2 text-right font-medium sm:px-6">Tax</th>
                <td className="px-5 py-2 text-right tabular-nums sm:px-6">{formatPricingAmount(order.tax, order.currency)}</td>
              </tr>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                <th scope="row" colSpan={4} className="px-5 py-3 text-right sm:px-6">Total</th>
                <td className="px-5 py-3 text-right text-base tabular-nums sm:px-6">{formatPricingAmount(order.total, order.currency)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </HmsCard>

      {order.invoice_number ? (
        <HmsCard id="po-invoice" title="Invoice" icon={Receipt} meaning="money">
          <p className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
            <span className="font-medium text-slate-900">{order.invoice_number}</span>
            <span aria-hidden>·</span>
            <span className="tabular-nums">{formatPricingAmount(order.invoice_amount, order.currency)}</span>
            {order.invoice_matched_at ? (
              <HmsPill tone="green">Matched to this order</HmsPill>
            ) : (
              <HmsPill tone="amber">Variance {formatPricingAmount(order.invoice_variance, order.currency)}</HmsPill>
            )}
          </p>
        </HmsCard>
      ) : null}

      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={(reason) => patch("reject", { reason }, "Purchase order rejected")} />
      <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} orderId={order.id} slug={slug} onDone={() => router.refresh()} />
    </HmsPage>
  );
}

function RejectDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Reject purchase order</DialogTitle>
        </DialogHeader>
        <HmsField id="po-reject-reason" label="Reason for rejection" hint="This is shown on the purchase order.">
          <input id="po-reject-reason" aria-describedby="po-reject-reason-hint" className={hmsInput} value={reason} onChange={(e) => setReason(e.target.value)} />
        </HmsField>
        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!reason.trim() || submitting}
            onClick={async () => {
              setSubmitting(true);
              try {
                await onConfirm(reason.trim());
                onOpenChange(false);
              } finally {
                setSubmitting(false);
              }
            }}
          >
            {submitting ? "Rejecting…" : "Reject"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InvoiceDialog({
  open,
  onOpenChange,
  orderId,
  slug,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  slug: string;
  onDone: () => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/hotel/procurement/orders/${orderId}/invoice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, invoiceNumber, invoiceAmount: Number(invoiceAmount) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not record invoice", data.error ?? "Try again.");
        return;
      }
      toastSuccess(data.matched ? "Invoice matched to PO" : "Invoice recorded with a variance — review before payment");
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
          <DialogTitle>Record vendor invoice</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <HmsField id="po-invoice-number" label="Invoice number">
            <input id="po-invoice-number" className={hmsInput} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </HmsField>
          <HmsField id="po-invoice-amount" label="Invoice amount" hint="We'll compare this with the order total.">
            <input
              id="po-invoice-amount"
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              aria-describedby="po-invoice-amount-hint"
              className={`${hmsInput} tabular-nums`}
              value={invoiceAmount}
              onChange={(e) => setInvoiceAmount(e.target.value)}
            />
          </HmsField>
        </div>
        <DialogFooter>
          <button type="button" className={hmsButton.secondary} onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </button>
          <button type="button" className={hmsButton.primary} disabled={!invoiceNumber.trim() || !invoiceAmount || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save & match"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
