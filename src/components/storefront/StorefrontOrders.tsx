"use client";

import { CHANNEL_LABELS } from "@/lib/store/manual-orders";
import { Fragment, useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Clock, Download, Landmark, Mail, MessageCircle, Phone, Plus, Search, Truck } from "lucide-react";
import type { DashboardOrder } from "@/lib/store/orders";
import { availableOrderActions, ORDER_ACTION_LABELS, ORDER_ACTIONS, type OrderAction } from "@/lib/store/order-status";
import { ORDER_STATUSES, ORDER_VIEWS, ORDERS_PAGE_SIZE, orderListSearchParams, paymentStatusLabel, type OrderListQuery, type OrderPaymentFilter, type OrderView } from "@/lib/store/order-list";
import { formatShopCurrency } from "@/lib/shop/format";
import { whatsappLink } from "@/lib/store/whatsapp";
import RecordOrderDialog from "./RecordOrderDialog";
import { DashAlert, DashEmptyState, DashPageHeader, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, dashButton, dashInput, sendJson } from "./dashboard-ui";

const STATUS_BADGE: Record<DashboardOrder["status"], string> = {
  Pending: "bg-amber-50 text-amber-800",
  Confirmed: "bg-sky-50 text-sky-800",
  Shipped: "bg-teal-50 text-teal-800",
  Delivered: "bg-emerald-50 text-emerald-800",
  Cancelled: "bg-red-50 text-red-800",
};

const ACTION_STYLE: Record<OrderAction, string> = {
  payment_received: "bg-emerald-600 text-white hover:bg-emerald-700",
  shipped: "bg-xyvoo-blue text-white",
  delivered: "border border-slate-300 text-slate-800 hover:bg-slate-50",
  cancel: "text-red-700 hover:bg-red-50",
};

const selectClass =
  "h-10 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue";

type ListResponse = { orders: DashboardOrder[]; total: number; counts: { toSend: number; toConfirm: number; awaiting: number } };

/** A day picked in the merchant's own time zone, as the start of that day (or of the next, for the end). */
const dayToIso = (day: string, end: boolean) => {
  if (!day) return null;
  const date = new Date(`${day}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  if (end) date.setDate(date.getDate() + 1);
  return date.toISOString();
};

export default function StorefrontOrders({ slug, currency, initialFilter, canExport }: { slug: string; currency: string; initialFilter?: string; canExport: boolean }) {
  const ids = useId();
  const initialShow = (ORDER_VIEWS as readonly string[]).includes(initialFilter ?? "") ? (initialFilter as OrderView) : "all";
  const initialStatus = (ORDER_STATUSES as readonly string[]).includes(initialFilter ?? "") ? (initialFilter as OrderListQuery["status"]) : null;
  const [view, setView] = useState<OrderView>(initialShow);
  const [status, setStatus] = useState<OrderListQuery["status"]>(initialStatus);
  const [payment, setPayment] = useState<OrderPaymentFilter>("any");
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [fromDay, setFromDay] = useState("");
  const [toDay, setToDay] = useState("");
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [reload, setReload] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<OrderAction | "">("");
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [upgradeNote, setUpgradeNote] = useState(false);
  // "Record an order": a sale made outside the online shop.
  const [recording, setRecording] = useState(false);
  const [recordedId, setRecordedId] = useState<string | null>(null);

  const query: Partial<OrderListQuery> = { view, status, payment, q, from: dayToIso(fromDay, false), to: dayToIso(toDay, true), page };
  const queryString = orderListSearchParams(query).toString();
  const requestKey = `${queryString}#${reload}`;
  const loading = loadedKey !== requestKey;
  const load = () => setReload((n) => n + 1);

  useEffect(() => {
    let cancelled = false;
    const key = `${queryString}#${reload}`;
    fetch(`/api/store/orders/list?slug=${encodeURIComponent(slug)}${queryString ? `&${queryString}` : ""}`)
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "We couldn't load your orders.");
        if (cancelled) return;
        setData(json as ListResponse);
        setError(null);
        setLoadedKey(key);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Something went wrong.");
        setLoadedKey(key);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, queryString, reload]);

  // Keep the address bar in step, so the page can be refreshed or shared as it is.
  useEffect(() => {
    const params = orderListSearchParams({ view, status, page });
    const url = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState(window.history.state, "", url);
  }, [view, status, page]);

  // Search as the merchant types, after a short pause.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const resetPage = () => {
    setPage(1);
    setSelected(new Set());
  };

  const orders = data?.orders ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE));
  const filtered = view !== "all" || status || payment !== "any" || q || fromDay || toDay;

  const act = async (order: DashboardOrder, action: OrderAction) => {
    if (action === "cancel" && confirmCancel !== order.id) {
      setConfirmCancel(order.id);
      return;
    }
    setBusy(order.id);
    setError(null);
    setMessage("");
    try {
      await sendJson(`/api/store/orders/${order.id}`, "PATCH", { slug, action });
      setConfirmCancel(null);
      setMessage(
        action === "cancel"
          ? `Order from ${order.customerName} cancelled. Its stock is back in your shop.`
          : `Order from ${order.customerName} updated: ${ORDER_ACTION_LABELS[action].toLowerCase()}.`,
      );
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const applyBulk = async () => {
    if (!bulkAction || selected.size === 0) return;
    if (bulkAction === "cancel" && !confirmBulk) {
      setConfirmBulk(true);
      return;
    }
    setBusy("bulk");
    setError(null);
    setMessage("");
    try {
      const result = (await sendJson("/api/store/orders/bulk", "POST", { slug, action: bulkAction, ids: [...selected] })) as { updated: number; skipped: number; failed: number };
      const parts = [`${result.updated} ${result.updated === 1 ? "order" : "orders"} updated: ${ORDER_ACTION_LABELS[bulkAction].toLowerCase()}.`];
      if (result.skipped) parts.push(`${result.skipped} couldn't be, because ${result.skipped === 1 ? "it isn't" : "they aren't"} at that stage.`);
      if (result.failed) parts.push(`${result.failed} didn't save. Please try ${result.failed === 1 ? "it" : "them"} again.`);
      setMessage(parts.join(" "));
      setSelected(new Set());
      setBulkAction("");
      setConfirmBulk(false);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const exportHref = `/api/store/orders/list?slug=${encodeURIComponent(slug)}&format=csv${(() => {
    const params = orderListSearchParams({ ...query, page: 1 });
    return params.toString() ? `&${params}` : "";
  })()}`;

  const allOnPage = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const showValue = status ?? view;
  // The tiles filter the list; pressing the one that's on goes back to every order.
  const pickView = (next: OrderView) => {
    setStatus(null);
    setView(view === next && !status ? "all" : next);
    resetPage();
  };

  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Orders"
        description="Everything customers have bought. Open an order to see what to send and where, then update it as it goes out."
        actions={
          <>
            {canExport ? (
              <a href={exportHref} className={dashButton.secondary} download>
                <Download className="h-4 w-4" aria-hidden /> Download CSV
              </a>
            ) : (
              <button type="button" className={dashButton.secondary} onClick={() => setUpgradeNote(true)} aria-expanded={upgradeNote} aria-controls={`${ids}-upgrade`}>
                <Download className="h-4 w-4" aria-hidden /> Download CSV
              </button>
            )}
            <button type="button" className={dashButton.primary} onClick={() => setRecording(true)}>
              <Plus className="h-4 w-4" aria-hidden /> Record an order
            </button>
          </>
        }
      />

      <RecordOrderDialog
        slug={slug}
        currency={currency}
        open={recording}
        onOpenChange={setRecording}
        onRecorded={(orderId) => {
          setRecordedId(orderId);
          load();
        }}
      />
      {recordedId ? (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          Order {recordedId.slice(0, 8).toUpperCase()} recorded. Stock has been updated.
          <Link href={`/storefront/${slug}/orders/${recordedId}`} className="font-semibold underline">
            View the order
          </Link>
        </div>
      ) : null}

      {upgradeNote && !canExport ? (
        <div id={`${ids}-upgrade`} className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Downloading your orders is part of the Standard plan.{" "}
          <Link href={`/storefront/${slug}/payments`} className="font-semibold underline">
            See plans in Payments and plan
          </Link>
        </div>
      ) : null}

      <DashSectionIntro
        id="orders"
        meaning="orders"
        art="truck"
        title="How orders work"
        points={[
          "Open an order to see what to send and where it's going.",
          "Mark it shipped, then delivered. Your customer gets an email each time.",
          "Once it's delivered, we ask your customer to rate what they bought.",
        ]}
      />

      <DashStatStrip label="Orders that need you" columns={3}>
        <DashStatTile
          label="Ready to send"
          meaning="orders"
          icon={Truck}
          hint="Paid, or paying on delivery"
          value={data ? String(data.counts.toSend) : null}
          onClick={() => pickView("to-send")}
          pressed={view === "to-send" && !status}
        />
        <DashStatTile
          label="Payments to check"
          meaning="money"
          icon={Landmark}
          hint="Bank transfers to confirm"
          value={data ? String(data.counts.toConfirm) : null}
          onClick={() => pickView("to-confirm")}
          pressed={view === "to-confirm" && !status}
        />
        <DashStatTile
          label="Awaiting payment"
          meaning="customers"
          icon={Clock}
          hint="Not paid for yet"
          value={data ? String(data.counts.awaiting) : null}
          onClick={() => pickView("awaiting")}
          pressed={view === "awaiting" && !status}
        />
      </DashStatStrip>

      <form
        role="search"
        aria-label="Find orders"
        className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          setQ(search.trim());
          resetPage();
        }}
      >
        <div className="sm:col-span-2">
          <label htmlFor={`${ids}-q`} className="mb-1 block text-sm font-medium text-slate-800">
            Search
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              id={`${ids}-q`}
              type="search"
              className={`${dashInput} pl-9`}
              placeholder="Name, email, phone or order number"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div>
          <label htmlFor={`${ids}-show`} className="mb-1 block text-sm font-medium text-slate-800">
            Show
          </label>
          <select
            id={`${ids}-show`}
            className={`${selectClass} w-full`}
            value={showValue}
            onChange={(e) => {
              const value = e.target.value;
              if ((ORDER_STATUSES as readonly string[]).includes(value)) {
                setStatus(value as OrderListQuery["status"]);
                setView("all");
              } else {
                setStatus(null);
                setView(value as OrderView);
              }
              resetPage();
            }}
          >
            <option value="all">All orders</option>
            <option value="to-send">Ready to send{data ? ` (${data.counts.toSend})` : ""}</option>
            <option value="to-confirm">Payments to check{data ? ` (${data.counts.toConfirm})` : ""}</option>
            <option value="awaiting">Awaiting payment{data ? ` (${data.counts.awaiting})` : ""}</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-payment`} className="mb-1 block text-sm font-medium text-slate-800">
            Payment
          </label>
          <select
            id={`${ids}-payment`}
            className={`${selectClass} w-full`}
            value={payment}
            onChange={(e) => {
              setPayment(e.target.value as OrderPaymentFilter);
              resetPage();
            }}
          >
            <option value="any">Any</option>
            <option value="paid">Paid online or confirmed</option>
            <option value="unpaid">Not paid online</option>
            <option value="refunded">Refunded</option>
            <option value="failed">Payment failed</option>
          </select>
        </div>
        <div>
          <label htmlFor={`${ids}-from`} className="mb-1 block text-sm font-medium text-slate-800">
            From
          </label>
          <input
            id={`${ids}-from`}
            type="date"
            className={`${dashInput} h-10 py-0`}
            value={fromDay}
            max={toDay || undefined}
            onChange={(e) => {
              setFromDay(e.target.value);
              resetPage();
            }}
          />
        </div>
        <div>
          <label htmlFor={`${ids}-to`} className="mb-1 block text-sm font-medium text-slate-800">
            To
          </label>
          <input
            id={`${ids}-to`}
            type="date"
            className={`${dashInput} h-10 py-0`}
            value={toDay}
            min={fromDay || undefined}
            onChange={(e) => {
              setToDay(e.target.value);
              resetPage();
            }}
          />
        </div>
        {filtered ? (
          <div className="sm:col-span-2 lg:col-span-6">
            <button
              type="button"
              className={dashButton.quiet}
              onClick={() => {
                setView("all");
                setStatus(null);
                setPayment("any");
                setSearch("");
                setQ("");
                setFromDay("");
                setToDay("");
                resetPage();
              }}
            >
              Clear filters
            </button>
          </div>
        ) : null}
      </form>

      {error ? <DashAlert message={error} /> : null}
      <div aria-live="polite">{message ? <DashStatus message={message} /> : null}</div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-blue-200 bg-blue-50/60 px-4 py-3">
          <p className="text-sm font-medium text-slate-900">
            {selected.size} {selected.size === 1 ? "order" : "orders"} selected
          </p>
          <label htmlFor={`${ids}-bulk`} className="sr-only">
            What to do with the selected orders
          </label>
          <select
            id={`${ids}-bulk`}
            className={selectClass}
            value={bulkAction}
            onChange={(e) => {
              setBulkAction(e.target.value as OrderAction | "");
              setConfirmBulk(false);
            }}
          >
            <option value="">Choose what to do…</option>
            {ORDER_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {ORDER_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
          <button type="button" className={bulkAction === "cancel" ? `${dashButton.danger} border border-red-200 bg-white` : dashButton.primary} disabled={!bulkAction || busy === "bulk"} onClick={applyBulk}>
            {busy === "bulk" ? "Updating…" : confirmBulk ? `Yes, cancel ${selected.size}` : "Apply"}
          </button>
          <button type="button" className={dashButton.quiet} onClick={() => setSelected(new Set())}>
            Clear selection
          </button>
          {confirmBulk ? (
            <p role="alert" className="w-full text-sm text-red-800">
              Cancel {selected.size === 1 ? "this order" : `these ${selected.size} orders`}? Their stock goes back into your shop and customers with an email address are told. Orders that are already delivered are left as they are.
            </p>
          ) : (
            <p className="w-full text-xs text-slate-600">Orders that aren&rsquo;t at the right stage are skipped, so nothing is changed by mistake.</p>
          )}
        </div>
      ) : null}

      {!data && loading ? (
        <div className="space-y-2">
          <p className="sr-only" role="status">
            Loading orders…
          </p>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden className="h-14 animate-pulse rounded-2xl bg-white motion-reduce:animate-none" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <DashEmptyState
          art={!filtered ? "basket" : "box"}
          meaning="orders"
          title={!filtered ? "No orders yet" : view === "to-send" || view === "to-confirm" ? "Nothing waiting here. You're all caught up." : "No orders match"}
          description={!filtered ? "When a customer buys from your shop, the order appears here and we email you straight away." : "Try a different search, or clear the filters to see everything."}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm" aria-busy={loading}>
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Orders. Select a customer&rsquo;s name to open the order.</caption>
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select every order on this page"
                      className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-xyvoo-blue"
                      checked={allOnPage}
                      onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...orders.map((o) => o.id)]) : new Set([...selected].filter((id) => !orders.some((o) => o.id === id))))}
                    />
                  </th>
                  <th scope="col" className="px-4 py-3">Customer</th>
                  <th scope="col" className="px-4 py-3">Items</th>
                  <th scope="col" className="px-4 py-3">Payment</th>
                  <th scope="col" className="px-4 py-3">Total</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="px-4 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const expanded = open === order.id;
                  const actions = availableOrderActions(order);
                  const money = (value: number) => formatShopCurrency(value, order.currency || currency);
                  const reference = order.id.slice(0, 8).toUpperCase();
                  const whatsapp = whatsappLink(order.customerPhone, `Hello ${order.customerName.split(/\s+/)[0]}, about your order ${reference}: `);
                  const address = [order.shippingAddress.line1, order.shippingAddress.line2, order.shippingAddress.city, order.shippingAddress.state].filter(Boolean).join(", ");
                  return (
                    <Fragment key={order.id}>
                      <tr className="border-b border-slate-50">
                        <td className="px-4 py-3 align-top">
                          <input
                            type="checkbox"
                            aria-label={`Select the order from ${order.customerName}, ${reference}`}
                            className="h-4 w-4 rounded border-slate-300 focus:ring-2 focus:ring-xyvoo-blue"
                            checked={selected.has(order.id)}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(order.id);
                              else next.delete(order.id);
                              setSelected(next);
                              setConfirmBulk(false);
                            }}
                          />
                        </td>
                        <th scope="row" className="px-4 py-3 font-normal">
                          <div className="flex items-start gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setOpen(expanded ? null : order.id);
                                setConfirmCancel(null);
                              }}
                              aria-expanded={expanded}
                              aria-controls={`order-${order.id}`}
                              aria-label={`${expanded ? "Hide" : "Show"} a summary of the order from ${order.customerName}`}
                              className="mt-0.5 rounded text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
                            >
                              {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                            </button>
                            <span className="min-w-0">
                              <Link href={`/storefront/${slug}/orders/${order.id}`} className="font-medium text-blue-800 hover:underline">
                                {order.customerName}
                              </Link>
                              <span className="block text-xs text-slate-500">
                                {reference} · {order.customerEmail || order.customerPhone || "No contact details"}
                              </span>
                            </span>
                          </div>
                        </th>
                        <td className="px-4 py-3 text-slate-600">{order.itemCount}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {order.paymentMethod}
                          <span className="block text-xs text-slate-500">
                            {paymentStatusLabel(order)}
                            {order.channel !== "online" ? ` · ${CHANNEL_LABELS[order.channel as keyof typeof CHANNEL_LABELS] ?? "Recorded by hand"}` : ""}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{money(order.totalAmount)}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[order.status]}`}>{order.status}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {new Date(order.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                      {expanded ? (
                        <tr className="border-b border-slate-100 bg-slate-50/60">
                          <td colSpan={7} className="px-4 py-4" id={`order-${order.id}`}>
                            <div className="grid gap-4 lg:grid-cols-2">
                              <div className="space-y-2 text-sm text-slate-700">
                                <p className="font-semibold text-slate-900">Order {reference}</p>
                                <ul>
                                  {order.items.map((i) => (
                                    <li key={i.id}>
                                      {i.quantity} × {i.product_name} <span className="text-slate-500">({money(Number(i.line_total) || 0)})</span>
                                    </li>
                                  ))}
                                </ul>
                                {order.discountAmount > 0 ? (
                                  <p>
                                    <span className="text-slate-500">Discount:</span> {order.discountCode ?? "Code"} took off {money(order.discountAmount)}
                                  </p>
                                ) : null}
                                <p>
                                  <span className="text-slate-500">Delivery:</span> {order.deliveryMethod || "Not chosen"}
                                  {address ? ` · ${address}` : ""}
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                  <Link href={`/storefront/${slug}/orders/${order.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-medium text-blue-800 hover:bg-blue-50">
                                    Open the order
                                  </Link>
                                  {whatsapp ? (
                                    <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-white hover:bg-emerald-700">
                                      <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp <span className="sr-only">(opens WhatsApp)</span>
                                    </a>
                                  ) : null}
                                  {order.customerPhone ? (
                                    <a href={`tel:${order.customerPhone.replace(/[^0-9+]/g, "")}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-white">
                                      <Phone className="h-4 w-4" aria-hidden /> Call
                                    </a>
                                  ) : null}
                                  {order.customerEmail ? (
                                    <a href={`mailto:${encodeURIComponent(order.customerEmail)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-white">
                                      <Mail className="h-4 w-4" aria-hidden /> Email
                                    </a>
                                  ) : null}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-semibold text-slate-900">Update this order</p>
                                {actions.length === 0 ? (
                                  <p className="text-sm text-slate-600">Nothing more to do: this order is {order.paymentStatus === "refunded" ? "refunded" : order.status.toLowerCase()}.</p>
                                ) : (
                                  <div className="flex flex-wrap gap-2">
                                    {actions.map((a) => (
                                      <button
                                        key={a}
                                        type="button"
                                        disabled={busy === order.id}
                                        onClick={() => act(order, a)}
                                        className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${ACTION_STYLE[a]}`}
                                      >
                                        {a === "cancel" && confirmCancel === order.id ? "Yes, cancel it" : ORDER_ACTION_LABELS[a]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {confirmCancel === order.id ? (
                                  <p role="alert" className="text-sm text-red-800">
                                    Cancel this order? Its stock goes back into your shop. If the customer paid, refund them from the order page.
                                  </p>
                                ) : null}
                                {actions.includes("payment_received") ? (
                                  <p className="text-xs text-slate-600">Check the money has arrived in your account before selecting &ldquo;Payment received&rdquo;.</p>
                                ) : null}
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          <nav aria-label="Pages of orders" className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <p>
              Showing {(page - 1) * ORDERS_PAGE_SIZE + 1}–{Math.min(page * ORDERS_PAGE_SIZE, total)} of {total.toLocaleString("en-GB")}
            </p>
            {pages > 1 ? (
              <div className="flex gap-2">
                <button type="button" className={dashButton.secondary} disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                  Previous
                </button>
                <span className="self-center" aria-current="page">
                  Page {page} of {pages}
                </span>
                <button type="button" className={dashButton.secondary} disabled={page >= pages || loading} onClick={() => setPage(page + 1)}>
                  Next
                </button>
              </div>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
