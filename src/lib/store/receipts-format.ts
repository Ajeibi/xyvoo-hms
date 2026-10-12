import { formatShopCurrency } from "@/lib/shop/format";
/*
 * Pure helpers for receipts, invoices and PDF reports: numbering, money and
 * text that the PDF's standard font (Helvetica) can draw. No database or
 * network access here, so it's all unit-testable.
 */

/** A shop's receipt number as customers see it: 123 → "R-000123". */
export function formatReceiptNumber(value: number | string | null | undefined) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n) || n <= 0) return null;
  return `R-${String(n).padStart(6, "0")}`;
}

/** Receipt tokens are 64 lowercase hex characters (see the receipts migration). */
export function isReceiptToken(value: string | null | undefined) {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Money for PDFs, the way the shop's customers write it, always to two
 * places: "₦10,000.00", "GH₵120.00". Negative amounts (discounts, refunds)
 * read "-₦500.00". If the PDF falls back to a font without the symbol,
 * toPdfText turns "₦" into "NGN ".
 */
export function pdfMoney(value: number, currency: string | null | undefined) {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  const formatted = formatShopCurrency(Math.abs(amount), currency || "NGN", { fractionDigits: 2 });
  return `${amount < 0 ? "-" : ""}${formatted}`;
}

/** Characters we swap for ones the standard font has, before falling back to removing accents. */
const REPLACEMENTS: Record<string, string> = {
  "₦": "NGN ",
  "−": "-",
  "–": "-",
  "—": "-",
  " ": " ",
  " ": " ",
  " ": " ",
  "…": "...",
  "\t": " ",
};

/**
 * Makes text drawable by a standard PDF font: known symbols are replaced,
 * accented letters the font lacks (for example Yoruba ọ, ẹ, ṣ) lose their
 * accents, and anything else unsupported becomes "?". `supported` is the
 * font's character set (font.getCharacterSet()).
 */
export function toPdfText(value: string | null | undefined, supported: ReadonlySet<number>) {
  if (!value) return "";
  let out = "";
  for (const char of String(value).replace(/\r?\n/g, " ")) {
    const code = char.codePointAt(0)!;
    if (supported.has(code)) {
      out += char;
      continue;
    }
    if (REPLACEMENTS[char] !== undefined) {
      out += REPLACEMENTS[char];
      continue;
    }
    const stripped = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
    out += stripped && [...stripped].every((c) => supported.has(c.codePointAt(0)!)) ? stripped : "?";
  }
  return out;
}

/**
 * Splits text into lines no wider than `maxWidth`, measured with `width`
 * (font.widthOfTextAtSize). Words longer than a line are broken.
 */
export function wrapText(text: string, maxWidth: number, width: (s: string) => number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let line = "";
  for (let word of words) {
    while (width(word) > maxWidth && word.length > 1) {
      // Break a very long word (an email address, say) at the widest part that fits.
      let cut = word.length - 1;
      while (cut > 1 && width(word.slice(0, cut)) > maxWidth) cut--;
      if (line) {
        lines.push(line);
        line = "";
      }
      lines.push(word.slice(0, cut));
      word = word.slice(cut);
    }
    const candidate = line ? `${line} ${word}` : word;
    if (width(candidate) <= maxWidth) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A variant's options as one readable phrase: {"Size": "M", "Colour": "Red"} → "Size: M, Colour: Red". */
export function describeVariantOptions(options: unknown) {
  if (!options || typeof options !== "object" || Array.isArray(options)) return "";
  return Object.entries(options as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

export type ReceiptKind = "receipt" | "invoice";

/**
 * Which document an order gets, or null for none: a receipt once it's paid;
 * an invoice while a bank transfer order waits for payment (and isn't
 * cancelled). Pay on delivery and WhatsApp orders get a receipt once the shop
 * confirms the payment.
 */
export function receiptKindFor(order: { payment_status: string | null; status: string | null; payment_method: string | null }): ReceiptKind | null {
  // A refunded order was paid, so it keeps its receipt (which shows the refund).
  if (order.payment_status === "paid" || order.payment_status === "refunded") return "receipt";
  if (order.status === "Cancelled" || order.payment_status === "failed") return null;
  if (order.payment_method === "Bank Transfer") return "invoice";
  return null;
}

/** "12 October 2026" in the shop's timezone. */
export function formatDocumentDate(iso: string | null | undefined, timezone: string) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: timezone }).format(date);
}

/** A safe file name part: "My Shop!" → "my-shop". */
export function fileSlug(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "shop"
  );
}
