"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { PurchaseOrderStatus, PurchaseOrderWithLines } from "@/lib/hms/procurement-types";

const STATUS_BADGE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-500 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-blue-50 text-blue-700 border-blue-200",
  ordered: "bg-indigo-50 text-indigo-700 border-indigo-200",
  partially_received: "bg-purple-50 text-purple-700 border-purple-200",
  received: "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed: "bg-slate-100 text-slate-500 border-slate-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  cancelled: "bg-slate-100 text-slate-500 border-slate-200",
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

  return (
    <div className="px-8 py-8">
      <Link href={`/hms/${slug}/procurement/orders`} className="mb-4 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="h-4 w-4" /> Back to purchase orders
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{order.po_number}</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {order.vendor_name} · {order.department}
            {order.fx_rate !== 1 ? ` · FX rate 1 ${order.currency} = ${order.fx_rate}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium capitalize ${STATUS_BADGE[order.status]}`}>
          {order.status.replace(/_/g, " ")}
        </span>
      </div>

      {order.is_manual ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Manual PO — {order.manual_reason}
        </p>
      ) : null}
      {order.status === "rejected" && order.rejection_reason ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-xs text-red-800">Rejected: {order.rejection_reason}</p>
      ) : null}

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-6 py-4">
          <h2 className="text-sm font-semibold text-slate-900">Line items</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {order.lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-6 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate text-slate-800">{l.description}</p>
                <p className="text-xs text-slate-400">
                  {l.quantity} × {formatPricingAmount(l.unit_cost, order.currency)}
                  {l.quantity_received > 0 ? ` · received ${l.quantity_received}` : ""}
                </p>
              </div>
              <span className="shrink-0 tabular-nums font-medium text-slate-700">{formatPricingAmount(l.line_total, order.currency)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-slate-100 px-6 py-4 text-sm">
          <span className="text-slate-500">Subtotal {formatPricingAmount(order.subtotal, order.currency)} + Tax {formatPricingAmount(order.tax, order.currency)}</span>
          <span className="text-base font-semibold text-slate-900">{formatPricingAmount(order.total, order.currency)}</span>
        </div>
      </div>

      {order.invoice_number ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-slate-900">Invoice</h2>
          <p className="mt-2 text-sm text-slate-600">
            {order.invoice_number} · {formatPricingAmount(order.invoice_amount, order.currency)}
            {order.invoice_matched_at ? (
              <span className="ml-2 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Matched</span>
            ) : (
              <span className="ml-2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                Variance {formatPricingAmount(order.invoice_variance, order.currency)}
              </span>
            )}
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        {order.status === "pending_approval" && canApprove ? (
          <>
            <Button type="button" disabled={busy} className="rounded-lg" onClick={() => void patch("approve", {}, `${order.po_number} approved`)}>
              Approve
            </Button>
            <Button type="button" variant="destructive" disabled={busy} className="rounded-lg" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          </>
        ) : null}
        {order.status === "approved" ? (
          <Button type="button" disabled={busy} className="rounded-lg" onClick={() => void patch("mark-ordered", {}, "Marked as sent to vendor")}>
            Mark as ordered
          </Button>
        ) : null}
        {(order.status === "ordered" || order.status === "partially_received") ? (
          <Button asChild variant="outline" className="rounded-lg">
            <Link href={`/hms/${slug}/procurement/receiving?poId=${order.id}`}>Receive goods</Link>
          </Button>
        ) : null}
        {!order.invoice_number && ["ordered", "partially_received", "received", "closed"].includes(order.status) ? (
          <Button type="button" variant="outline" disabled={busy} className="rounded-lg" onClick={() => setInvoiceOpen(true)}>
            Record invoice
          </Button>
        ) : null}
        {["draft", "pending_approval", "approved", "ordered"].includes(order.status) ? (
          <Button type="button" variant="outline" disabled={busy} className="rounded-lg" onClick={() => void patch("cancel", {}, "Purchase order cancelled")}>
            Cancel
          </Button>
        ) : null}
      </div>

      <RejectDialog open={rejectOpen} onOpenChange={setRejectOpen} onConfirm={(reason) => patch("reject", { reason }, "Purchase order rejected")} />
      <InvoiceDialog open={invoiceOpen} onOpenChange={setInvoiceOpen} orderId={order.id} slug={slug} onDone={() => router.refresh()} />
    </div>
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
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection" />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
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
          </Button>
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
        <div className="space-y-3">
          <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Invoice number" />
          <Input type="number" min="0" step="any" value={invoiceAmount} onChange={(e) => setInvoiceAmount(e.target.value)} placeholder="Invoice amount" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" disabled={!invoiceNumber.trim() || !invoiceAmount || submitting} onClick={() => void submit()}>
            {submitting ? "Saving…" : "Save & match"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
