import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAnalyticsDetail, getAnalyticsSummary } from "./analytics";
import { TaggedPdf } from "./receipts-pdf";
import { formatDocumentDate, formatReceiptNumber, pdfMoney } from "./receipts-format";
import { isSale } from "./sales";

/*
 * Downloads of a period's analytics (Standard plan, "exports"): the sales as
 * CSV (one row per order), daily totals as CSV, and a PDF summary. A sale is
 * an order paid online or one the shop confirmed, sent or delivered, the
 * same rule as the Analytics page (store.is_sale).
 */

// ------------------------------------------------------------------ CSV (pure)

/**
 * One CSV cell. Text that a spreadsheet would run as a formula (starting
 * with =, +, -, @ or a control character) is prefixed with an apostrophe.
 * Numbers are written as they are.
 */
export function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** A whole CSV file, with a byte-order mark so Excel reads accents and symbols correctly. */
export function toCsv(header: string[], rows: Array<Array<string | number | null | undefined>>) {
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

const money2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export type SaleRow = {
  createdAt: string;
  reference: string;
  receiptNumber: string | null;
  customer: string;
  items: string;
  subtotal: number;
  discount: number;
  delivery: number;
  tax: number | null;
  total: number;
  refunded: number;
  paymentMethod: string;
  status: string;
};

/** Date and time in the store's timezone, as "2026-10-08 14:05" (sorts and opens cleanly in spreadsheets). */
export function localDateTime(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

export function salesCsv(rows: SaleRow[], currency: string, timezone: string) {
  return toCsv(
    ["Date", "Order reference", "Receipt number", "Customer", "Items", `Subtotal (${currency})`, `Discount (${currency})`, `Delivery (${currency})`, `Tax (${currency})`, `Total (${currency})`, `Refunded (${currency})`, "Payment method", "Status"],
    rows.map((r) => [
      localDateTime(r.createdAt, timezone),
      r.reference,
      r.receiptNumber ?? "",
      r.customer,
      r.items,
      money2(r.subtotal),
      money2(r.discount),
      money2(r.delivery),
      r.tax === null ? "" : money2(r.tax),
      money2(r.total),
      money2(r.refunded),
      r.paymentMethod,
      r.status,
    ]),
  );
}

export function dailyCsv(daily: { day: string; visitors: number; paidOrders: number; revenue: number }[], currency: string) {
  return toCsv(
    ["Date", "Visitors", "Orders (sales)", `Sales (${currency})`],
    daily.map((d) => [d.day, d.visitors, d.paidOrders, money2(d.revenue)]),
  );
}

// ------------------------------------------------------------------ data

type OrderRow = {
  id: string;
  created_at: string;
  customer_name: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  total_amount: number | string;
  delivery_fee: number | string | null;
  discount_amount: number | string | null;
  receipt_number?: number | string | null;
  tax_amount?: number | string | null;
  refunded_amount?: number | string | null;
  order_items: { product_name: string; quantity: number; line_total: number | string }[] | null;
};

const BASE = "id, created_at, customer_name, status, payment_status, payment_method, total_amount, delivery_fee, discount_amount, order_items(product_name, quantity, line_total)";
const OPTIONAL_COLUMNS = ["receipt_number", "tax_amount", "refunded_amount"] as const;
const PAGE = 1000;
const MAX_ROWS = 20_000;

/** The period's sales, oldest first. Reads the receipt and tax columns only if they exist yet. */
export async function loadSales(tenantId: string, from: Date, to: Date): Promise<SaleRow[]> {
  const db = createServerSupabaseClient().schema("store");
  const fetchPage = (columns: string, offset: number) =>
    db
      .from("orders")
      .select(columns)
      .eq("tenant_id", tenantId)
      .gte("created_at", from.toISOString())
      .lt("created_at", to.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

  // Newer columns are read if they exist: a missing one (migration not run yet) is dropped and the query tried again.
  let optional = [...OPTIONAL_COLUMNS];
  let columns = BASE;
  let rows: OrderRow[] = [];
  for (;;) {
    columns = [BASE, ...optional].join(", ");
    const first = await fetchPage(columns, 0);
    if (!first.error) {
      rows = (first.data || []) as unknown as OrderRow[];
      break;
    }
    const message = first.error.message;
    if (!optional.length) throw new Error(message);
    const missing = optional.find((c) => message.includes(c));
    optional = missing ? optional.filter((c) => c !== missing) : [];
  }
  for (let offset = PAGE; rows.length === offset && offset < MAX_ROWS; offset += PAGE) {
    const next = await fetchPage(columns, offset);
    if (next.error) throw new Error(next.error.message);
    rows = rows.concat((next.data || []) as unknown as OrderRow[]);
  }

  const hasTax = optional.includes("tax_amount");
  return rows
    .filter((o) => isSale(o.payment_status, o.status))
    .map((o) => {
      const items = o.order_items || [];
      return {
        createdAt: o.created_at,
        reference: o.id.slice(0, 8).toUpperCase(),
        receiptNumber: formatReceiptNumber(o.receipt_number ?? null),
        customer: o.customer_name,
        items: items.map((i) => `${i.quantity} x ${i.product_name}`).join("; "),
        subtotal: items.reduce((s, i) => s + (Number(i.line_total) || 0), 0),
        discount: Number(o.discount_amount) || 0,
        delivery: Number(o.delivery_fee) || 0,
        tax: hasTax ? Number(o.tax_amount) || 0 : null,
        total: Number(o.total_amount) || 0,
        refunded: Number(o.refunded_amount) || 0,
        paymentMethod: o.payment_method || "",
        status: o.payment_status === "paid" && o.status === "Confirmed" ? "Paid" : o.status,
      };
    });
}

// ------------------------------------------------------------------ PDF summary

const shortDay = (day: string) => new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export async function renderAnalyticsPdf(input: { tenantId: string; storeName: string; currency: string; timezone: string; from: Date; to: Date; fromDate: string; toDate: string }) {
  const { tenantId, storeName, currency, timezone, from, to } = input;
  const [summary, detail] = await Promise.all([getAnalyticsSummary(tenantId, from, to), getAnalyticsDetail(tenantId, from, to, timezone)]);
  const money = (v: number) => pdfMoney(v, currency);
  const period = input.fromDate === input.toDate ? formatDocumentDate(from.toISOString(), timezone) : `${formatDocumentDate(from.toISOString(), timezone)} to ${formatDocumentDate(new Date(to.getTime() - 1).toISOString(), timezone)}`;

  const pdf = await TaggedPdf.create({ title: `Sales summary for ${storeName}: ${period}`, subject: `Sales summary, ${period}`, author: storeName });
  pdf.paragraph(storeName, { size: 13, bold: true, after: 2 });
  pdf.heading("Sales summary", 1);
  pdf.paragraph(period, { size: 11, muted: true, after: 2 });
  pdf.paragraph(
    "Sales include orders paid online and orders you confirmed, sent or delivered, less any refunds. Visitor figures only include shoppers who accept analytics cookies, and are kept for 28 days.",
    { size: 9, muted: true, after: 6 },
  );

  pdf.heading("Headline figures");
  const averageOrder = summary.paidOrders ? summary.revenue / summary.paidOrders : 0;
  const conversion = summary.sessions ? Math.round((summary.paidOrders / summary.sessions) * 1000) / 10 : 0;
  pdf.table(
    [
      { header: "Figure", width: 260 },
      { header: "Value", width: pdf.contentWidth - 260, align: "right" },
    ],
    [
      ["Sales", { text: money(summary.revenue), bold: true }],
      ["Orders (sales)", summary.paidOrders.toLocaleString("en-GB")],
      ["Average order", money(averageOrder)],
      ["All orders placed, including unpaid and cancelled", summary.orders.toLocaleString("en-GB")],
      ["Visitors", summary.visitors.toLocaleString("en-GB")],
      ["Visits that bought", `${conversion}%`],
    ],
    { headerRow: false, rowHeaders: true },
  );

  pdf.heading("Top products");
  if (detail.products.length) {
    pdf.table(
      [
        { header: "Product", width: pdf.contentWidth - 240 },
        { header: "Views", width: 60, align: "right" },
        { header: "Sold", width: 60, align: "right" },
        { header: "Sales", width: 120, align: "right" },
      ],
      detail.products.map((p) => [p.name, p.views.toLocaleString("en-GB"), p.unitsSold.toLocaleString("en-GB"), money(p.revenue)]),
      { zebra: true, size: 9.5 },
    );
  } else {
    pdf.paragraph("No products were viewed or sold in this period.", { muted: true });
  }

  pdf.heading("Day by day");
  pdf.table(
    [
      { header: "Day", width: pdf.contentWidth - 270 },
      { header: "Visitors", width: 70, align: "right" },
      { header: "Orders", width: 70, align: "right" },
      { header: "Sales", width: 130, align: "right" },
    ],
    detail.daily.map((d) => [shortDay(d.day), d.visitors.toLocaleString("en-GB"), d.paidOrders.toLocaleString("en-GB"), money(d.revenue)]),
    { zebra: true, size: 9.5, rowHeaders: true },
  );

  return pdf.save(`${storeName} · Sales summary`);
}
