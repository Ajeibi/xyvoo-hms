import { createHmac, timingSafeEqual } from "node:crypto";
import { formatShopCurrency } from "@/lib/shop/format";
import { whatsappLink } from "@/lib/store/whatsapp";
import type { InvoiceData } from "@/lib/hms/folio-invoice";

/*
 * Sending the guest's bill on WhatsApp from the hotel's own number. A wa.me link can only carry
 * text, so the message has a private link to the PDF: signed, so only someone who was sent it can
 * open it, and good for 30 days. Staff press send in their own WhatsApp; the HMS sends nothing.
 */

export const INVOICE_LINK_DAYS = 30;

function secret() {
  const key = process.env.HMS_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("No secret to sign bill links with.");
  return key;
}

const sign = (payload: string) => createHmac("sha256", `hms-invoice-link:${secret()}`).update(payload).digest("base64url");

/** A token naming one stay's bill, which expires after `days`. */
export function signInvoiceToken(tenantId: string, reservationId: string, days = INVOICE_LINK_DAYS, now = Date.now()) {
  const payload = Buffer.from(`${tenantId}.${reservationId}.${Math.floor(now / 1000) + days * 86400}`).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The stay a token names, or null if it was changed, is for something else or has expired. */
export function verifyInvoiceToken(token: string, now = Date.now()): { tenantId: string; reservationId: string } | null {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [tenantId, reservationId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!tenantId || !reservationId || !(Number(exp) * 1000 > now)) return null;
  return { tenantId, reservationId };
}

const COUNTRY_CODES: Record<string, string> = { nigeria: "NG", ghana: "GH", kenya: "KE", "south africa": "ZA" };

/** The country code for reading the guest's local number, from the hotel's saved country. */
export function phoneCountry(hotelCountry: string | null) {
  const c = hotelCountry?.trim().toLowerCase() ?? "";
  return COUNTRY_CODES[c] ?? (/^(ng|gh|ke|za)$/.test(c) ? c.toUpperCase() : "NG");
}

/** The message the guest reads, with the link to their bill. */
export function invoiceWhatsAppMessage(d: Pick<InvoiceData, "guest" | "hotelName" | "isFinal" | "invoiceNumber" | "total" | "paid" | "balance" | "currency">, url: string) {
  const money = (v: number) => formatShopCurrency(v, d.currency);
  const first = d.guest.name.replace(/^(mr|mrs|ms|miss|dr|prof|chief)\.?\s+/i, "").split(/\s+/)[0] || "there";
  const settled = Math.abs(d.balance) < 0.01;
  const status = settled ? "Paid in full." : d.balance > 0 ? `Balance due: *${money(d.balance)}*` : `We owe you: *${money(-d.balance)}*`;
  return [
    `Hello ${first},`,
    "",
    d.isFinal
      ? `Here is your invoice${d.invoiceNumber ? ` *${d.invoiceNumber}*` : ""} from ${d.hotelName}.`
      : `Here is your bill so far at ${d.hotelName}. It can still change until you check out.`,
    `Total: ${money(d.total)}`,
    `Paid: ${money(d.paid)}`,
    status,
    "",
    `View or download it here (the link works for ${INVOICE_LINK_DAYS} days):`,
    url,
    "",
    d.isFinal ? `Thank you for staying with us.` : `Thank you for staying with us. Let us know if anything looks wrong.`,
  ].join("\n");
}

/** The wa.me link that opens WhatsApp with the message ready, or null if the number isn't usable. */
export function invoiceWhatsAppLink(phone: string, message: string, hotelCountry: string | null) {
  return whatsappLink(phone, message, phoneCountry(hotelCountry));
}
