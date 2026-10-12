/*
 * The Orders list's filters, search and CSV, as plain functions so the
 * dashboard and the API read them the same way. No server code here.
 */
import { orderRef, type DashboardOrder } from "./orders";

export const ORDERS_PAGE_SIZE = 25;

export const ORDER_STATUSES = ["Pending", "Confirmed", "Shipped", "Delivered", "Cancelled"] as const;
/** Quick views: the Home page links to the first two (?show=to-send, ?show=to-confirm). */
export const ORDER_VIEWS = ["all", "to-send", "to-confirm", "awaiting"] as const;
export const ORDER_PAYMENT_FILTERS = ["any", "paid", "unpaid", "refunded", "failed"] as const;

export type OrderView = (typeof ORDER_VIEWS)[number];
export type OrderPaymentFilter = (typeof ORDER_PAYMENT_FILTERS)[number];

export type OrderListQuery = {
  view: OrderView;
  status: (typeof ORDER_STATUSES)[number] | null;
  payment: OrderPaymentFilter;
  q: string;
  /** ISO timestamps, inclusive start and exclusive end. */
  from: string | null;
  to: string | null;
  page: number;
};

const isoOrNull = (value: string | null) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
};

/** Reads the list's query string. Unknown values fall back to "everything". `show` may also be a status (older links). */
export function parseOrderListQuery(params: URLSearchParams): OrderListQuery {
  const show = params.get("show") ?? "";
  const statusParam = params.get("status") || ((ORDER_STATUSES as readonly string[]).includes(show) ? show : "");
  const page = Number.parseInt(params.get("page") ?? "1", 10);
  return {
    view: (ORDER_VIEWS as readonly string[]).includes(show) ? (show as OrderView) : "all",
    status: (ORDER_STATUSES as readonly string[]).includes(statusParam) ? (statusParam as OrderListQuery["status"]) : null,
    payment: (ORDER_PAYMENT_FILTERS as readonly string[]).includes(params.get("payment") ?? "") ? (params.get("payment") as OrderPaymentFilter) : "any",
    q: cleanOrderSearch(params.get("q") ?? ""),
    from: isoOrNull(params.get("from")),
    to: isoOrNull(params.get("to")),
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** The query string for a list request (only the parts that are set). */
export function orderListSearchParams(query: Partial<OrderListQuery>) {
  const params = new URLSearchParams();
  if (query.view && query.view !== "all") params.set("show", query.view);
  if (query.status) params.set("status", query.status);
  if (query.payment && query.payment !== "any") params.set("payment", query.payment);
  if (query.q) params.set("q", query.q);
  if (query.from) params.set("from", query.from);
  if (query.to) params.set("to", query.to);
  if (query.page && query.page > 1) params.set("page", String(query.page));
  return params;
}

/**
 * Search text that is safe inside a PostgREST filter: letters (any
 * language), digits, spaces and the characters found in emails and phone
 * numbers. Commas, brackets, quotes and wildcards are dropped.
 */
export function cleanOrderSearch(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s@.+\-_']/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

/** An order reference the shopper might read out ("3f9a12bc", "#3F9A 12BC"), or null. */
export function orderRefSearch(q: string) {
  const compact = q.replace(/[\s#-]/g, "").toUpperCase();
  return /^[0-9A-F]{4,8}$/.test(compact) ? compact : null;
}

/** The digits of a phone search, if it looks like one, matched on the last 7 so +234 and 0 prefixes both find it. */
export function phoneSearchDigits(q: string) {
  if (/[a-z@]/i.test(q)) return null;
  const digits = q.replace(/\D/g, "");
  return digits.length >= 5 ? digits.slice(-7) : null;
}

const CSV_HEADERS = [
  "Order",
  "Date",
  "Customer",
  "Email",
  "Phone",
  "Status",
  "Payment method",
  "Payment",
  "Items",
  "Discount code",
  "Discount",
  "Delivery",
  "Delivery fee",
  "Total",
  "Refunded",
  "Currency",
  "Address",
  "Tracking number",
  "Carrier",
];

/** One CSV cell. Cells that a spreadsheet would run as a formula are prefixed with an apostrophe. */
export function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function paymentStatusLabel(order: Pick<DashboardOrder, "paymentStatus" | "status" | "refundedAmount">) {
  if (order.paymentStatus === "refunded") return "Refunded";
  if (order.paymentStatus === "failed") return "Payment failed";
  const part = order.refundedAmount > 0 ? " (part refunded)" : "";
  if (order.paymentStatus === "paid") return `Paid${part}`;
  if (order.status === "Cancelled") return "Not paid";
  return order.status === "Pending" ? "Awaiting payment" : `Paid (confirmed by you)${part}`;
}

export function ordersToCsv(orders: DashboardOrder[]) {
  const rows = orders.map((o) => {
    const address = [o.shippingAddress.line1, o.shippingAddress.line2, o.shippingAddress.city, o.shippingAddress.state, o.shippingAddress.country].filter(Boolean).join(", ");
    const items = o.items.map((i) => `${i.quantity} x ${i.product_name}`).join("; ");
    return [
      orderRef(o.id),
      o.createdAt.slice(0, 16).replace("T", " "),
      o.customerName,
      o.customerEmail,
      o.customerPhone,
      o.status,
      o.paymentMethod,
      paymentStatusLabel(o),
      items,
      o.discountCode,
      o.discountAmount ? o.discountAmount.toFixed(2) : "",
      o.deliveryMethod,
      o.deliveryFee ? o.deliveryFee.toFixed(2) : "",
      o.totalAmount.toFixed(2),
      o.refundedAmount ? o.refundedAmount.toFixed(2) : "",
      o.currency,
      address,
      o.trackingNumber,
      o.trackingCarrier,
    ]
      .map(csvCell)
      .join(",");
  });
  // The byte-order mark makes Excel read names with accents correctly.
  return `﻿${[CSV_HEADERS.join(","), ...rows].join("\r\n")}\r\n`;
}
