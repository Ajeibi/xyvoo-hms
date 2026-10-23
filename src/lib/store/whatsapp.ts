const DIAL_CODES: Record<string, string> = { NG: "234", GH: "233", KE: "254", ZA: "27" };

/**
 * A phone number as WhatsApp wants it (country code and number, digits only,
 * e.g. "2348031234567"), or null if it can't be turned into one. Local numbers
 * starting with 0 take the shop's country code (Nigeria, Ghana, Kenya or South Africa).
 */
export function whatsappNumber(phone: string | null | undefined, countryCode = "NG") {
  if (!phone) return null;
  let digits = phone.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = (DIAL_CODES[countryCode] || "234") + digits.slice(1);
  return /^[1-9][0-9]{7,14}$/.test(digits) ? digits : null;
}

/** A WhatsApp link (wa.me) for a Nigerian, Ghanaian, Kenyan or South African number, or null if it can't be turned into one. */
export function whatsappLink(phone: string | null, message: string, countryCode = "NG") {
  const digits = whatsappNumber(phone, countryCode);
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null;
}

export type WhatsAppOrderMessage = {
  storeName: string;
  reference: string;
  items: Array<{ quantity: number; name: string; variantLabel?: string | null; unitPrice: string; lineTotal: string; url?: string | null }>;
  /** Money lines under the items, already formatted: subtotal, delivery, discount. */
  extras: Array<{ label: string; value: string }>;
  total: string;
  deliveryMethod?: string | null;
  customer: { name: string; phone?: string | null; email?: string | null; address?: string | null };
};

/** Most items listed in full; a wa.me link has a length limit, so a long basket ends with "and N more". */
const MAX_LISTED_ITEMS = 12;

/**
 * The message a shopper sends the shop after ordering on WhatsApp: the order
 * number, every item with its price and a link to its page (WhatsApp shows the
 * picture as a preview), the totals and who the order is for. A wa.me link can
 * only carry text, so pictures go as links rather than attachments.
 */
export function whatsappOrderMessage(input: WhatsAppOrderMessage) {
  const { storeName, reference, items, extras, total, deliveryMethod, customer } = input;
  const listed = items.slice(0, MAX_LISTED_ITEMS);
  const lines = [`Hello ${storeName}, I've just placed order *${reference}* and I'd like to complete it here.`, "", "*My order*"];
  for (const i of listed) {
    lines.push(`${i.quantity} × ${i.name}${i.variantLabel ? ` (${i.variantLabel})` : ""}`);
    lines.push(`${i.unitPrice} each · ${i.lineTotal}`);
    if (i.url) lines.push(i.url);
    lines.push("");
  }
  if (items.length > listed.length) lines.push(`…and ${items.length - listed.length} more`, "");
  for (const e of extras) lines.push(`${e.label}: ${e.value}`);
  lines.push(`*Total: ${total}*`, "");
  if (deliveryMethod) lines.push(`*Delivery:* ${deliveryMethod}`);
  lines.push(`*Name:* ${customer.name}`);
  if (customer.phone) lines.push(`*Phone:* ${customer.phone}`);
  if (customer.email) lines.push(`*Email:* ${customer.email}`);
  if (customer.address) lines.push(`*Address:* ${customer.address}`);
  return lines.join("\n");
}
