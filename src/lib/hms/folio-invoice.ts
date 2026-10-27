import type { SupabaseClient } from "@supabase/supabase-js";
import { EARLY_CHECKOUT_ADJUSTMENT_REF, fetchFolioLines, isBookedStayLine, stayLinePart, type FolioLineRow } from "@/lib/hms/folio";
import { EXTRA_NIGHT_REF_PREFIX } from "@/lib/hms/folio-extra-nights";
import { DISCOUNT_REF_PREFIX } from "@/lib/hms/folio-discounts";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { badge, detailsPanel } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { TaggedPdf, type TableCell } from "@/lib/store/receipts-pdf";
import { fileSlug, pdfMoney } from "@/lib/store/receipts-format";
import { fetchLogo } from "@/lib/store/receipts";
import { formatShopCurrency } from "@/lib/shop/format";

/*
 * The guest's bill as a document: an invoice that is also the receipt. Items (room, extra nights,
 * food and extras, discounts), then a tax summary (service charge, levy, VAT, already net of
 * discounts and credits), then payments and what is left to pay. A finished stay carries the
 * hotel's invoice number (hotel.assign_invoice_number); a stay still in house gets a "Bill so far"
 * without one. Front desk times are wall-clock stored as UTC, so dates are shown in UTC.
 */

const TAX_PARTS = ["service_charge", "state_levy", "vat", "stamp_levy"] as const;
type TaxPart = (typeof TAX_PARTS)[number];
const TAX_LABEL: Record<TaxPart, string> = {
  service_charge: "Service charge",
  state_levy: "State / local levy",
  vat: "VAT (7.5%)",
  stamp_levy: "Stamp levy",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  pos: "Card machine",
  direct_bill: "Direct bill",
  split: "Split",
  transfer: "Bank transfer",
  paystack: "Paystack",
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function longDate(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

export type InvoiceItem = { date: string; description: string; amount: number };

export type InvoiceBody = {
  items: InvoiceItem[];
  taxes: { label: string; amount: number }[];
  payments: { date: string; description: string; amount: number }[];
  itemsTotal: number;
  taxTotal: number;
  total: number;
  paid: number;
  balance: number;
};

/** Sorts a bill's lines into items, a tax summary and payments. Pure, so it can be tested. */
export function buildInvoiceBody(lines: FolioLineRow[]): InvoiceBody {
  const active = lines.filter((l) => !l.voided_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const items: InvoiceItem[] = [];
  const taxes = new Map<TaxPart, number>();
  const payments: InvoiceBody["payments"] = [];
  const extra = { nights: [] as string[], amount: 0, firstAt: "" };

  for (const l of active) {
    if (l.kind === "payment" || l.kind === "refund") {
      payments.push({
        date: shortDate(l.created_at),
        description: l.kind === "refund" ? `Refund${l.description ? `: ${l.description}` : ""}` : `Paid by ${(METHOD_LABEL[l.method] ?? l.method).toLowerCase()}`,
        amount: roundMoney(-l.amount),
      });
      continue;
    }
    const ref = l.reference ?? "";
    const isStayLine =
      l.department === "rooms" &&
      (isBookedStayLine(l) ||
        ref.startsWith(DISCOUNT_REF_PREFIX) ||
        ref === EARLY_CHECKOUT_ADJUSTMENT_REF);
    const part = isStayLine || ref.startsWith(EXTRA_NIGHT_REF_PREFIX) ? stayLinePart(l) : null;

    if (part && (TAX_PARTS as readonly string[]).includes(part)) {
      taxes.set(part as TaxPart, (taxes.get(part as TaxPart) ?? 0) + l.amount);
      continue;
    }
    if (ref.startsWith(EXTRA_NIGHT_REF_PREFIX)) {
      // All extra nights as one item.
      extra.nights.push(ref.slice(EXTRA_NIGHT_REF_PREFIX.length, EXTRA_NIGHT_REF_PREFIX.length + 10));
      extra.amount += l.amount;
      extra.firstAt ||= l.created_at;
      continue;
    }
    items.push({ date: shortDate(l.created_at), description: l.description ?? l.kind, amount: roundMoney(l.amount) });
  }

  if (extra.nights.length > 0) {
    const sorted = [...new Set(extra.nights)].sort();
    const first = shortDate(`${sorted[0]}T12:00:00.000Z`);
    const last = shortDate(`${sorted[sorted.length - 1]}T12:00:00.000Z`);
    items.push({
      date: shortDate(extra.firstAt),
      description: `Extra nights, ${sorted.length} (${first}${sorted.length > 1 ? ` to ${last}` : ""}), stayed past departure`,
      amount: roundMoney(extra.amount),
    });
  }

  const taxRows = TAX_PARTS.filter((p) => Math.abs(taxes.get(p) ?? 0) >= 0.005).map((p) => ({ label: TAX_LABEL[p], amount: roundMoney(taxes.get(p)!) }));
  const itemsTotal = roundMoney(items.reduce((s, i) => s + i.amount, 0));
  const taxTotal = roundMoney(taxRows.reduce((s, t) => s + t.amount, 0));
  const total = roundMoney(itemsTotal + taxTotal);
  const paid = roundMoney(payments.reduce((s, p) => s + p.amount, 0));
  return { items, taxes: taxRows, payments, itemsTotal, taxTotal, total, paid, balance: roundMoney(total - paid) };
}

export type InvoiceData = InvoiceBody & {
  hotelName: string;
  logoUrl: string | null;
  hotelLines: string[];
  taxId: string | null;
  currency: string;
  guest: { name: string; email: string | null; phone: string | null };
  company: { account: string | null; po: string | null };
  roomCode: string | null;
  confirmationCode: string;
  folioNumber: string;
  invoiceNumber: string | null;
  issuedAt: string;
  arrivalAt: string | null;
  departureAt: string | null;
  nights: number;
  isFinal: boolean;
};

type GuestEmbed = { first_name: string; last_name: string; title: string | null; email: string | null; phone: string | null };

/**
 * Everything the invoice shows, or null if the stay isn't this hotel's. A checked-out stay
 * without a number gets one now (older stays, from before invoices were numbered).
 */
export async function loadInvoiceData(supabase: SupabaseClient, tenantId: string, reservationId: string): Promise<InvoiceData | null> {
  const { data: r } = await supabase
    .schema("hotel")
    .from("reservations")
    .select(
      "id,status,confirmation_code,folio_number,arrival_at,departure_at,checked_in_at,checked_out_at,nights,room_unit_id,bill_to_account,po_number,invoice_number,invoice_issued_at,reservation_guests(is_primary,guests(first_name,last_name,title,email,phone))",
    )
    .eq("tenant_id", tenantId)
    .eq("id", reservationId)
    .maybeSingle();
  if (!r) return null;

  const isFinal = r.status === "checked_out";
  let invoiceNumber = (r.invoice_number as string | null) ?? null;
  let issuedAt = (r.invoice_issued_at as string | null) ?? null;
  if (isFinal && !invoiceNumber) {
    const assigned = await assignInvoiceNumber(supabase, tenantId, reservationId);
    if (assigned) {
      invoiceNumber = assigned;
      issuedAt = new Date().toISOString();
    }
  }

  const [{ data: tenant }, { data: profile }, { data: settings }, { data: unit }, lines] = await Promise.all([
    supabase.from("tenants").select("name,display_name,logo_url,pricing_setup").eq("id", tenantId).maybeSingle(),
    // One profile per staff member; the hotel's contact details are on the one that has them.
    supabase
      .schema("hotel")
      .from("profiles")
      .select("address,city,country,contact_phone")
      .eq("tenant_id", tenantId)
      .or("address.not.is.null,contact_phone.not.is.null")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase.schema("hotel").from("tenant_folio_settings").select("tax_id").eq("tenant_id", tenantId).maybeSingle(),
    r.room_unit_id
      ? supabase.schema("hotel").from("room_units").select("room_code").eq("id", r.room_unit_id).maybeSingle()
      : Promise.resolve({ data: null }),
    fetchFolioLines(supabase, tenantId, reservationId),
  ]);

  const embeds = (r.reservation_guests ?? []) as { is_primary: boolean; guests: GuestEmbed | GuestEmbed[] | null }[];
  const primary = embeds.find((e) => e.is_primary) ?? embeds[0];
  const g = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
  const guestName = g ? `${g.title ? `${g.title} ` : ""}${g.first_name} ${g.last_name}`.trim() : "Guest";

  // The saved address often already ends with the city and country, so add them only when missing.
  const address = typeof profile?.address === "string" ? profile.address.trim() : "";
  const extras = [profile?.city, profile?.country]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter((v) => v && !address.toLowerCase().includes(v.toLowerCase()));
  const place = [address, ...extras].filter(Boolean).join(", ");
  return {
    ...buildInvoiceBody(lines),
    hotelName: (tenant?.display_name as string) || (tenant?.name as string) || "Hotel",
    logoUrl: (tenant?.logo_url as string | null) ?? null,
    hotelLines: [place, profile?.contact_phone ? `Phone ${profile.contact_phone}` : ""].filter(Boolean) as string[],
    taxId: (settings?.tax_id as string | null)?.trim() || null,
    currency: normalizePricingSetup(tenant?.pricing_setup).currency,
    guest: { name: guestName, email: g?.email ?? null, phone: g?.phone ?? null },
    company: { account: (r.bill_to_account as string | null) ?? null, po: (r.po_number as string | null) ?? null },
    roomCode: (unit?.room_code as string | undefined) ?? null,
    confirmationCode: r.confirmation_code as string,
    folioNumber: r.folio_number as string,
    invoiceNumber,
    issuedAt: issuedAt ?? new Date().toISOString(),
    arrivalAt: (r.checked_in_at as string | null) ?? (r.arrival_at as string | null) ?? null,
    departureAt: (r.checked_out_at as string | null) ?? (r.departure_at as string | null) ?? null,
    nights: Number(r.nights) || 0,
    isFinal,
  };
}

/** Gives a stay its invoice number (or returns the one it has). Null if the database refused. */
export async function assignInvoiceNumber(supabase: SupabaseClient, tenantId: string, reservationId: string) {
  const { data, error } = await supabase.schema("hotel").rpc("assign_invoice_number", { p_tenant: tenantId, p_reservation: reservationId });
  if (error) {
    console.error("[invoice] number not assigned", error);
    return null;
  }
  return (data as string | null) ?? null;
}

/** The invoice (or bill so far) as an accessible PDF. */
export async function renderInvoicePdf(d: InvoiceData) {
  const docName = d.isFinal ? `Invoice${d.invoiceNumber ? ` ${d.invoiceNumber}` : ""}` : "Bill so far";
  const pdf = await TaggedPdf.create({ title: `${docName} from ${d.hotelName}`, subject: `${docName} for ${d.guest.name}`, author: d.hotelName });
  const money = (v: number) => pdfMoney(v, d.currency);

  // ---- Hotel
  const logo = await fetchLogo(d.logoUrl);
  let textX = pdf.left;
  const top = pdf.y;
  if (logo) {
    try {
      const image = logo.type === "png" ? await pdf.doc.embedPng(logo.bytes) : await pdf.doc.embedJpg(logo.bytes);
      const { width } = pdf.figure(image, `${d.hotelName} logo`, 48, 120);
      textX = pdf.left + width + 14;
    } catch {
      // An unreadable logo just isn't shown.
    }
  }
  const textWidth = pdf.right - textX;
  pdf.paragraph(d.hotelName, { size: 15, bold: true, x: textX, width: textWidth, after: 2 });
  for (const line of d.hotelLines) pdf.paragraph(line, { size: 9.5, muted: true, x: textX, width: textWidth, after: 1 });
  if (d.taxId) pdf.paragraph(`Tax number (TIN): ${d.taxId}`, { size: 9.5, muted: true, x: textX, width: textWidth, after: 1 });
  if (logo) pdf.y = Math.min(pdf.y, top - 52);
  pdf.rule(10);

  // ---- Title and details
  pdf.heading(d.isFinal ? "Invoice" : "Bill so far", 1);
  if (!d.isFinal) pdf.paragraph("The guest is still staying, so this bill can still change. The final invoice is made at check-out.", { size: 10, muted: true });
  const from = d.arrivalAt ? longDate(d.arrivalAt) : "";
  const to = d.departureAt ? longDate(d.departureAt) : "";
  const nightsText = d.nights > 0 ? ` (${d.nights} night${d.nights === 1 ? "" : "s"})` : "";
  const stay = from && to && from !== to ? `${from} to ${to}${nightsText}` : from || to ? `${from || to}${nightsText}` : "";
  const details: TableCell[][] = [
    ...(d.invoiceNumber ? [["Invoice number", { text: d.invoiceNumber, bold: true }] as TableCell[]] : []),
    [d.isFinal ? "Invoice date" : "Date", longDate(d.issuedAt)],
    ["Guest", d.guest.name],
    ...(d.roomCode ? [["Room", d.roomCode]] : []),
    ...(stay ? [["Stay", stay]] : []),
    ["Booking reference", d.confirmationCode],
    ["Bill number", d.folioNumber],
    ...(d.company.account ? [["Billed to company", `${d.company.account}${d.company.po ? `, PO ${d.company.po}` : ""}`]] : []),
  ];
  pdf.table(
    [
      { header: "Detail", width: 150 },
      { header: "Value", width: pdf.contentWidth - 150 },
    ],
    details,
    { headerRow: false, rowHeaders: true, size: 10 },
  );

  // ---- Items
  pdf.heading("Charges");
  const dateW = 70;
  const amountW = 110;
  pdf.table(
    [
      { header: "Date", width: dateW },
      { header: "Description", width: pdf.contentWidth - dateW - amountW },
      { header: "Amount", width: amountW, align: "right" },
    ],
    d.items.length ? d.items.map((i) => [i.date, i.description, money(i.amount)]) : [["", "No charges", money(0)]],
    { size: 10, zebra: true },
  );

  // ---- Taxes and total, then each payment and what is left
  const settled = Math.abs(d.balance) < 0.01;
  pdf.heading("Taxes, payments and balance");
  const totals: TableCell[][] = [
    ["Charges before tax", money(d.itemsTotal)],
    ...d.taxes.map((t) => [t.label, money(t.amount)]),
    [{ text: "Total", bold: true }, { text: money(d.total), bold: true }],
    ...(d.payments.length ? d.payments.map((p) => [`${p.description}, ${p.date}`, money(-p.amount)]) : [["No payments yet", money(0)]]),
    [
      { text: settled ? "Paid in full" : d.balance > 0 ? "Balance due" : "Owed back to the guest", bold: true },
      { text: money(Math.abs(d.balance)), bold: true },
    ],
  ];
  pdf.table(
    [
      { header: "Summary", width: pdf.contentWidth - 160 },
      { header: "Amount", width: 160, align: "right" },
    ],
    totals,
    { headerRow: false, rowHeaders: true, size: 10.5 },
  );

  pdf.rule(10);
  pdf.paragraph(`Thank you for staying at ${d.hotelName}.`, { bold: true });
  pdf.paragraph(`Questions about this bill? Contact ${d.hotelName} and quote ${d.invoiceNumber ?? d.folioNumber}.`, { size: 10, muted: true });

  const bytes = await pdf.save(`${docName} · ${d.hotelName}`);
  const filename = `${fileSlug(d.hotelName)}-${(d.invoiceNumber ?? `bill-${d.folioNumber}`).toLowerCase()}.pdf`;
  return { bytes, filename };
}

/** The invoice PDF for a stay, or null when the stay isn't found or the PDF couldn't be made. */
export async function buildInvoicePdf(supabase: SupabaseClient, tenantId: string, reservationId: string) {
  try {
    const data = await loadInvoiceData(supabase, tenantId, reservationId);
    if (!data) return null;
    return { ...(await renderInvoicePdf(data)), data };
  } catch (error) {
    console.error("[invoice] PDF not made", error);
    return null;
  }
}

/**
 * Emails the guest their invoice (or bill so far) with the PDF attached. `to` overrides the
 * guest's own address. Never throws: returns where it went, or why it didn't.
 */
export async function sendInvoiceEmail(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; to?: string | null },
): Promise<{ ok: true; to: string; invoiceNumber: string | null } | { ok: false; error: string }> {
  try {
    const built = await buildInvoicePdf(supabase, params.tenantId, params.reservationId);
    if (!built) return { ok: false, error: "The bill couldn't be made." };
    const d = built.data;
    const to = params.to?.trim() || d.guest.email;
    if (!to) return { ok: false, error: "This guest has no email address. Enter one to send the bill." };

    const money = (v: number) => formatShopCurrency(v, d.currency);
    const settled = Math.abs(d.balance) < 0.01;
    const docName = d.isFinal ? `invoice${d.invoiceNumber ? ` ${d.invoiceNumber}` : ""}` : "bill so far";
    const status = settled ? "Paid in full" : d.balance > 0 ? `Balance due: ${money(d.balance)}` : `Owed back to you: ${money(-d.balance)}`;
    await sendBrandedEmail({
      to,
      subject: d.isFinal ? `Your invoice from ${d.hotelName}${d.invoiceNumber ? ` (${d.invoiceNumber})` : ""}` : `Your bill so far at ${d.hotelName}`,
      text: [
        `Hello ${d.guest.name},`,
        "",
        `Your ${docName} from ${d.hotelName} is attached.`,
        `Total: ${money(d.total)}`,
        `Paid: ${money(d.paid)}`,
        status,
        "",
        `Thank you for staying at ${d.hotelName}.`,
      ].join("\n"),
      layout: {
        preheader: `${d.hotelName}: total ${money(d.total)}. ${status}.`,
        badges: [badge(settled ? "Paid" : d.isFinal ? "Invoice" : "Bill so far", settled ? "green" : "blue")],
        title: d.isFinal ? "Your invoice" : "Your bill so far",
        intro: `Hello ${d.guest.name}, your ${docName} from ${d.hotelName} is attached to this email.`,
        body: detailsPanel([
          ...(d.invoiceNumber ? [{ label: "Invoice", value: d.invoiceNumber }] : []),
          ...(d.roomCode ? [{ label: "Room", value: d.roomCode }] : []),
          { label: "Booking", value: d.confirmationCode },
          { label: "Total", value: money(d.total) },
          { label: "Paid", value: money(d.paid) },
          { label: settled ? "Status" : "Left to pay", value: settled ? "Paid in full" : money(Math.abs(d.balance)) },
        ]),
        footerNote: `You're receiving this because you stayed at ${d.hotelName}.`,
      },
      attachments: [{ filename: built.filename, content: built.bytes, contentType: "application/pdf" }],
    });
    return { ok: true, to, invoiceNumber: d.invoiceNumber };
  } catch (error) {
    console.error("[invoice] email not sent", error);
    return { ok: false, error: "The email couldn't be sent. Please try again." };
  }
}
