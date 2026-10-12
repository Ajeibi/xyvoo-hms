"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Clock, CreditCard, Mail, MessageCircle, NotebookPen, Package, Phone, RotateCcw, Truck, User } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { OrderDetail } from "@/lib/store/order-detail";
import type { OrderEvent } from "@/lib/store/order-events";
import { paymentStatusLabel } from "@/lib/store/order-list";
import ReceiptButton from "./ReceiptButton";
import { availableOrderActions, ORDER_ACTION_LABELS, type OrderAction } from "@/lib/store/order-status";
import { orderRef } from "@/lib/store/orders";
import { refundableAmount, refundAmountProblem, refundMethod } from "@/lib/store/refunds";
import { whatsappLink } from "@/lib/store/whatsapp";
import { DashAlert, DashCard, DashField, DashPill, DashStatus, dashButton, dashInput, sendJson } from "./dashboard-ui";

const STATUS_TONE = { Pending: "amber", Confirmed: "blue", Shipped: "blue", Delivered: "green", Cancelled: "red" } as const;

const ACTION_STYLE: Record<OrderAction, string> = {
  payment_received: dashButton.primary,
  shipped: dashButton.primary,
  delivered: dashButton.secondary,
  cancel: dashButton.danger,
};

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

const EVENT_ICON: Partial<Record<OrderEvent["kind"], React.ComponentType<{ className?: string }>>> = {
  created: Package,
  paid: CreditCard,
  status_changed: Truck,
  note: NotebookPen,
  tracking: Truck,
  refund: RotateCcw,
  restocked: Package,
  email_sent: Mail,
};

function eventActor(event: OrderEvent) {
  if (event.actorName) return `by ${event.actorName}`;
  if (event.kind === "email_sent") return "by XYVOO";
  if (event.kind === "status_changed" || event.kind === "paid") return "automatically";
  return "";
}

export default function OrderDetailView({ slug, detail, countryCode, canRefund }: { slug: string; detail: OrderDetail; countryCode: string; canRefund: boolean }) {
  const router = useRouter();
  const { order, items, events, refunds } = detail;
  const money = (value: number) => formatShopCurrency(value, order.currency);
  const reference = orderRef(order.id);
  const actions = availableOrderActions(order);
  const refundable = refundableAmount(order);
  const card = refundMethod(order) === "paystack";
  const ids = useId();

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [note, setNote] = useState("");
  const [tracking, setTracking] = useState({ number: order.trackingNumber ?? "", carrier: order.trackingCarrier ?? "" });
  const [refund, setRefund] = useState<null | { amount: string; reason: string; restock: boolean; quantities: Record<string, string>; confirming: boolean }>(null);

  const run = async (key: string, task: () => Promise<string>) => {
    setBusy(key);
    setError("");
    setMessage("");
    try {
      setMessage(await task());
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const act = (action: OrderAction) => {
    if (action === "cancel" && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    void run(action, async () => {
      await sendJson(`/api/store/orders/${order.id}`, "PATCH", { slug, action });
      setConfirmCancel(false);
      if (action === "cancel") return "Order cancelled. Its stock is back in your shop.";
      if (action === "payment_received") return "Payment recorded. This order now counts as a sale.";
      return order.customerEmail ? `Order updated: ${ORDER_ACTION_LABELS[action].toLowerCase()}. We've emailed ${order.customerName} to let them know.` : `Order updated: ${ORDER_ACTION_LABELS[action].toLowerCase()}.`;
    });
  };

  const address = [order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.country].filter(Boolean).join(", ");
  const whatsapp = whatsappLink(order.customerPhone, `Hello ${order.customerName.split(/\s+/)[0]}, about your order ${reference}: `, countryCode);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);

  const refundAmount = refund ? Number(refund.amount) : 0;
  const refundProblem = refund ? refundAmountProblem(refundAmount, refundable) : null;
  const restockItems = refund?.restock
    ? items.map((i) => ({ itemId: i.id, quantity: Math.max(0, Math.min(Number(refund.quantities[i.id] ?? 0) || 0, i.quantity - (i.restocked_quantity ?? 0))) })).filter((r) => r.quantity > 0)
    : [];

  const submitRefund = () => {
    if (!refund) return;
    if (refundProblem) {
      setError(refundProblem);
      return;
    }
    if (!refund.confirming) {
      setRefund({ ...refund, confirming: true });
      return;
    }
    void run("refund", async () => {
      await sendJson(`/api/store/orders/${order.id}/refund`, "POST", { slug, amount: refundAmount, reason: refund.reason, restock: restockItems });
      setRefund(null);
      return `${card ? "Refunded" : "Refund recorded:"} ${money(refundAmount)}.${order.customerEmail ? ` We've emailed ${order.customerName} to let them know.` : ""}`;
    });
  };

  return (
    <div className="space-y-6">
      <Link href={`/storefront/${slug}/orders`} className="inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-blue-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All orders
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Order {reference}</h1>
          <p className="mt-1 text-base text-slate-600" suppressHydrationWarning>
            {order.customerName} · {dateTime(order.createdAt)} · {money(order.totalAmount)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DashPill tone={STATUS_TONE[order.status]}>{order.status}</DashPill>
          <DashPill tone={order.paymentStatus === "refunded" || order.paymentStatus === "failed" ? "red" : order.paymentStatus === "paid" ? "green" : "slate"}>{paymentStatusLabel(order)}</DashPill>
        </div>
      </header>

      <div aria-live="polite">{message ? <DashStatus message={message} /> : null}</div>
      {error ? <DashAlert message={error} /> : null}

      <DashCard id={`${ids}-actions`} title="Update this order" icon={Truck}>
        {actions.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing more to do: this order is {order.paymentStatus === "refunded" ? "refunded" : order.status.toLowerCase()}.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <button key={a} type="button" disabled={busy !== null} onClick={() => act(a)} className={ACTION_STYLE[a]}>
                {a === "cancel" && confirmCancel ? "Yes, cancel it" : ORDER_ACTION_LABELS[a]}
              </button>
            ))}
            {confirmCancel ? (
              <button type="button" className={dashButton.quiet} onClick={() => setConfirmCancel(false)}>
                Keep the order
              </button>
            ) : null}
          </div>
        )}
        {confirmCancel ? (
          <p role="alert" className="mt-3 text-sm text-red-800">
            Cancel this order? Its stock goes back into your shop{order.customerEmail ? ` and we'll email ${order.customerName}` : ""}. If they paid, refund them below too.
          </p>
        ) : null}
        {actions.includes("payment_received") ? (
          <p className="mt-3 text-sm text-slate-600">Check the money has arrived in your account before selecting &ldquo;Payment received&rdquo;.</p>
        ) : null}
        {order.status === "Delivered" && order.customerEmail ? (
          detail.reviewRequestedAt ? (
            <p className="mt-3 text-sm text-slate-600" suppressHydrationWarning>
              We asked {order.customerName} for a review on {dateTime(detail.reviewRequestedAt)}. Their review will show in Reviews.
            </p>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={busy !== null}
                className={dashButton.secondary}
                onClick={() =>
                  run("review-request", async () => {
                    await sendJson(`/api/store/orders/${order.id}/review-request`, "POST", { slug });
                    return `We've emailed ${order.customerName} asking them to review their order.`;
                  })
                }
              >
                {busy === "review-request" ? "Sending…" : "Ask for a review"}
              </button>
              <span className="text-sm text-slate-600">We email the customer a link to rate what they bought and add photos.</span>
            </div>
          )
        ) : null}
        {actions.includes("shipped") && !order.trackingNumber ? (
          <p className="mt-3 text-sm text-slate-600">Add a tracking number under Delivery first if you have one, and we&rsquo;ll include it in the email to the customer.</p>
        ) : null}
      </DashCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <DashCard id={`${ids}-items`} title="Items" icon={Package}>
          <ul className="divide-y divide-slate-100 text-sm">
            {items.map((item) => {
              const options = Object.entries(item.options);
              return (
                <li key={item.id} className="flex justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900">
                      {item.quantity} × {item.product_name}
                    </p>
                    {options.length ? <p className="text-slate-600">{options.map(([k, v]) => `${k}: ${v}`).join(", ")}</p> : null}
                    {(item.restocked_quantity ?? 0) > 0 ? <p className="text-xs text-slate-500">{item.restocked_quantity} back in stock</p> : null}
                  </div>
                  <p className="shrink-0 text-slate-800">{money(Number(item.line_total) || 0)}</p>
                </li>
              );
            })}
          </ul>
          <dl className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm">
            <Row label="Items" value={money(subtotal)} />
            {order.discountAmount > 0 ? <Row label={`Discount${order.discountCode ? ` (${order.discountCode})` : ""}`} value={`−${money(order.discountAmount)}`} /> : null}
            {order.deliveryFee > 0 ? <Row label="Delivery" value={money(order.deliveryFee)} /> : null}
            <Row label="Total" value={money(order.totalAmount)} strong />
          </dl>
        </DashCard>

        <DashCard id={`${ids}-customer`} title="Customer" icon={User}>
          <dl className="space-y-1 text-sm">
            <Row label="Name" value={order.customerName} />
            <Row label="Email" value={order.customerEmail || "Not given"} />
            <Row label="Phone" value={order.customerPhone || "Not given"} />
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            {whatsapp ? (
              <a href={whatsapp} target="_blank" rel="noreferrer" className={`${dashButton.secondary} text-emerald-800`}>
                <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp <span className="sr-only">(opens WhatsApp)</span>
              </a>
            ) : null}
            {order.customerPhone ? (
              <a href={`tel:${order.customerPhone.replace(/[^0-9+]/g, "")}`} className={dashButton.secondary}>
                <Phone className="h-4 w-4" aria-hidden /> Call
              </a>
            ) : null}
            {order.customerEmail ? (
              <a href={`mailto:${encodeURIComponent(order.customerEmail)}?subject=${encodeURIComponent(`Your order ${reference}`)}`} className={dashButton.secondary}>
                <Mail className="h-4 w-4" aria-hidden /> Email
              </a>
            ) : null}
          </div>
        </DashCard>

        <DashCard id={`${ids}-payment`} title="Payment" icon={CreditCard}>
          <dl className="space-y-1 text-sm">
            <Row label="Method" value={order.paymentMethod} />
            <Row label="Status" value={paymentStatusLabel(order)} />
            {detail.paidAt ? <Row label="Paid" value={dateTime(detail.paidAt)} /> : null}
            <Row label="Amount" value={money(order.totalAmount)} />
            {order.discountAmount > 0 ? <Row label="Discount code" value={`${order.discountCode ?? "Code"} (−${money(order.discountAmount)})`} /> : null}
            {order.platformFee > 0 ? <Row label="XYVOO fee" value={money(order.platformFee)} /> : null}
            {order.refundedAmount > 0 ? <Row label="Refunded" value={money(order.refundedAmount)} /> : null}
          </dl>

          {order.paymentStatus === "paid" || order.paymentStatus === "refunded" ? (
            <div className="mt-3">
              <ReceiptButton slug={slug} orderId={order.id} />
            </div>
          ) : order.paymentMethod === "Bank Transfer" && order.status !== "Cancelled" ? (
            <div className="mt-3">
              <ReceiptButton slug={slug} orderId={order.id} kind="invoice" />
            </div>
          ) : null}

          {refunds.length ? (
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-700">
              {refunds.map((r) => (
                <li key={r.id} suppressHydrationWarning>
                  {money(r.amount)} {r.method === "paystack" ? "through Paystack" : "returned by you"}, {dateTime(r.createdAt)}
                  {r.status === "failed" ? " (didn't go through)" : r.status === "processing" || r.status === "pending" ? " (Paystack is processing it)" : ""}
                  {r.reason ? <span className="block text-slate-500">{r.reason}</span> : null}
                </li>
              ))}
            </ul>
          ) : null}

          {canRefund && refundable > 0 && !refund ? (
            <button
              type="button"
              className={`${dashButton.secondary} mt-4`}
              onClick={() => {
                setError("");
                setRefund({
                  amount: String(refundable),
                  reason: "",
                  restock: false,
                  quantities: Object.fromEntries(items.map((i) => [i.id, String(Math.max(0, i.quantity - (i.restocked_quantity ?? 0)))])),
                  confirming: false,
                });
              }}
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Refund
            </button>
          ) : null}
          {!canRefund && refundable > 0 ? <p className="mt-3 text-sm text-slate-600">Only the shop owner or an admin can give refunds.</p> : null}

          {refund ? (
            <form
              className="mt-4 space-y-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
              aria-labelledby={`${ids}-refund-title`}
              onSubmit={(e) => {
                e.preventDefault();
                submitRefund();
              }}
            >
              <h3 id={`${ids}-refund-title`} className="text-sm font-semibold text-slate-900">
                Refund this order
              </h3>
              <DashField id={`${ids}-refund-amount`} label={`Amount to refund (up to ${money(refundable)})`}>
                <input
                  id={`${ids}-refund-amount`}
                  className={dashInput}
                  inputMode="decimal"
                  value={refund.amount}
                  aria-invalid={refund.amount !== "" && Boolean(refundProblem)}
                  onChange={(e) => setRefund({ ...refund, amount: e.target.value.replace(/[^0-9.]/g, ""), confirming: false })}
                />
              </DashField>
              <DashField id={`${ids}-refund-reason`} label="Reason" optional hint="Only your team sees this.">
                <input id={`${ids}-refund-reason`} className={dashInput} maxLength={500} value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value, confirming: false })} />
              </DashField>
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-xyvoo-blue" checked={refund.restock} onChange={(e) => setRefund({ ...refund, restock: e.target.checked, confirming: false })} />
                  Put items back in stock
                </label>
                {refund.restock ? (
                  <fieldset className="mt-3 space-y-2">
                    <legend className="text-sm text-slate-600">How many of each go back on sale?</legend>
                    {items.map((item) => {
                      const left = item.quantity - (item.restocked_quantity ?? 0);
                      return (
                        <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                          <label htmlFor={`${ids}-restock-${item.id}`} className="min-w-0 text-slate-800">
                            {item.product_name}
                            {Object.keys(item.options).length ? ` (${Object.values(item.options).join(", ")})` : ""}
                          </label>
                          <input
                            id={`${ids}-restock-${item.id}`}
                            type="number"
                            min={0}
                            max={left}
                            disabled={left <= 0}
                            className={`${dashInput} w-20 shrink-0`}
                            value={refund.quantities[item.id] ?? "0"}
                            onChange={(e) => setRefund({ ...refund, quantities: { ...refund.quantities, [item.id]: e.target.value }, confirming: false })}
                          />
                        </div>
                      );
                    })}
                  </fieldset>
                ) : null}
              </div>
              <p className="text-sm text-slate-700">
                {card
                  ? "The money goes back to the card or account the customer paid with, through Paystack."
                  : "This order wasn't paid by card, so give the money back yourself (for example by bank transfer), then record it here."}{" "}
                <strong>XYVOO&rsquo;s fee on this order isn&rsquo;t refunded.</strong>
              </p>
              {refund.confirming ? (
                <p role="alert" className="text-sm font-medium text-slate-900">
                  {card ? `Refund ${money(refundAmount)} to ${order.customerName}?` : `Record that you've given ${order.customerName} ${money(refundAmount)}?`} This can&rsquo;t be undone.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <button type="submit" className={dashButton.primary} disabled={busy !== null || Boolean(refundProblem)}>
                  {busy === "refund" ? "Refunding…" : refund.confirming ? `Yes, refund ${money(refundAmount || 0)}` : card ? "Refund" : "Record refund"}
                </button>
                <button type="button" className={dashButton.secondary} onClick={() => setRefund(null)}>
                  Cancel
                </button>
              </div>
              {refund.amount !== "" && refundProblem ? <p className="text-sm text-red-800">{refundProblem}</p> : null}
            </form>
          ) : null}
        </DashCard>

        <DashCard id={`${ids}-delivery`} title="Delivery" icon={Truck}>
          <dl className="space-y-1 text-sm">
            <Row label="Method" value={order.deliveryMethod || "Not chosen"} />
            <Row label="Address" value={address || "Not given"} />
            <Row label="Fee" value={money(order.deliveryFee)} />
          </dl>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("tracking", async () => {
                await sendJson(`/api/store/orders/${order.id}/tracking`, "PATCH", { slug, number: tracking.number, carrier: tracking.carrier });
                return tracking.number ? "Tracking details saved." : "Tracking details removed.";
              });
            }}
          >
            <DashField id={`${ids}-tracking-number`} label="Tracking number" optional>
              <input id={`${ids}-tracking-number`} className={dashInput} maxLength={100} value={tracking.number} onChange={(e) => setTracking({ ...tracking, number: e.target.value })} />
            </DashField>
            <DashField id={`${ids}-tracking-carrier`} label="Carrier" optional>
              <input id={`${ids}-tracking-carrier`} className={dashInput} maxLength={100} placeholder="For example GIG Logistics" value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} />
            </DashField>
            <div className="sm:col-span-2">
              <button type="submit" className={dashButton.secondary} disabled={busy !== null}>
                {busy === "tracking" ? "Saving…" : "Save tracking"}
              </button>
            </div>
          </form>
        </DashCard>
      </div>

      <DashCard id={`${ids}-timeline`} title="Timeline" description="Everything that has happened to this order, with who did it. Notes are private to your team." icon={Clock}>
        <form
          className="mb-5 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!note.trim()) return;
            void run("note", async () => {
              await sendJson(`/api/store/orders/${order.id}/notes`, "POST", { slug, message: note.trim() });
              setNote("");
              return "Note added.";
            });
          }}
        >
          <DashField id={`${ids}-note`} label="Add a private note">
            <textarea id={`${ids}-note`} rows={2} maxLength={2000} className={dashInput} value={note} onChange={(e) => setNote(e.target.value)} />
          </DashField>
          <button type="submit" className={dashButton.secondary} disabled={busy !== null || !note.trim()}>
            {busy === "note" ? "Saving…" : "Add note"}
          </button>
        </form>

        {events.length === 0 ? (
          <p className="text-sm text-slate-600">Nothing recorded yet.</p>
        ) : (
          <ol className="space-y-4">
            {[...events].reverse().map((event) => {
              const Icon = EVENT_ICON[event.kind] ?? Clock;
              return (
                <li key={event.id} className="flex gap-3">
                  <span aria-hidden className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-600">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 text-sm">
                    <p className={`break-words text-slate-900 ${event.kind === "note" ? "whitespace-pre-wrap" : ""}`}>
                      {event.kind === "note" ? <span className="font-medium">Note: </span> : null}
                      {event.message}
                    </p>
                    <p className="text-slate-500" suppressHydrationWarning>
                      <time dateTime={event.createdAt}>{dateTime(event.createdAt)}</time> {eventActor(event)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </DashCard>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-600">{label}</dt>
      <dd className={`min-w-0 break-words text-right ${strong ? "font-semibold text-slate-900" : "text-slate-800"}`}>{value}</dd>
    </div>
  );
}
