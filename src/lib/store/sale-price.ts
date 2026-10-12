import { z } from "zod";

/*
 * Sale prices (flash sales). A product or a variant can have a sale price with
 * an optional start and end, so a sale switches itself on and off. The rules
 * live here, once, for the shop pages, the basket and checkout; the database
 * applies the same rules when it prices an order (store.create_guest_order).
 *
 * - A sale is on from its start (or straight away) until its end (or until
 *   the merchant removes it). The end time itself is no longer on sale.
 * - A sale price only counts when it is below the normal price it replaces.
 * - A variant's own sale wins; otherwise a variant's own price; otherwise the
 *   product's sale price while it's on, else the product's price.
 * - Sales are a Standard plan feature: on Free, every sale is ignored.
 */

export type SaleFields = {
  salePrice: number | null;
  saleStartsAt: string | null;
  saleEndsAt: string | null;
};

export type PricedProduct = SaleFields & { price: number };
export type PricedVariant = SaleFields & { priceOverride: number | null };

export type EffectivePrice = {
  /** What the shopper pays for one. */
  price: number;
  /** The normal price, shown struck through while on sale. */
  regular: number;
  onSale: boolean;
  /** When the sale that set the price ends, if it has an end. */
  saleEndsAt: string | null;
};

/** Whether a sale is on at this moment (ignoring whether the price is actually lower). */
export function saleIsLive(sale: SaleFields, now: Date) {
  if (sale.salePrice == null || !Number.isFinite(sale.salePrice) || sale.salePrice < 0) return false;
  if (sale.saleStartsAt && new Date(sale.saleStartsAt).getTime() > now.getTime()) return false;
  if (sale.saleEndsAt && new Date(sale.saleEndsAt).getTime() <= now.getTime()) return false;
  return true;
}

const onSale = (sale: SaleFields, regular: number, now: Date) => saleIsLive(sale, now) && (sale.salePrice as number) < regular;

/** The price of one product, or one of its variants, at `now`. */
export function effectivePrice(product: PricedProduct, variant: PricedVariant | null | undefined, now: Date, salesEnabled: boolean): EffectivePrice {
  if (variant) {
    const regular = variant.priceOverride ?? product.price;
    if (salesEnabled && onSale(variant, regular, now)) {
      return { price: variant.salePrice as number, regular, onSale: true, saleEndsAt: variant.saleEndsAt };
    }
    if (variant.priceOverride != null) return { price: regular, regular, onSale: false, saleEndsAt: null };
  }
  if (salesEnabled && onSale(product, product.price, now)) {
    return { price: product.salePrice as number, regular: product.price, onSale: true, saleEndsAt: product.saleEndsAt };
  }
  return { price: product.price, regular: product.price, onSale: false, saleEndsAt: null };
}

/** Database columns to sale fields (numeric columns arrive as strings). */
export function saleFromRow(row: { sale_price?: number | string | null; sale_starts_at?: string | null; sale_ends_at?: string | null }): SaleFields {
  return {
    salePrice: row.sale_price == null ? null : Number(row.sale_price),
    saleStartsAt: row.sale_starts_at ?? null,
    saleEndsAt: row.sale_ends_at ?? null,
  };
}

/** "Sale ends in 3 days", "Sale ends in 5 hours", "Sale ends in 20 minutes"; null once it has ended. */
export function saleEndsText(endsAt: string, now: Date) {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `Sale ends in ${plural(days, "day")}`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `Sale ends in ${plural(hours, "hour")}`;
  return `Sale ends in ${plural(Math.max(1, Math.ceil(ms / 60_000)), "minute")}`;
}

// ---------------------------------------------------------------------------
// Checking what the dashboard sends.
// ---------------------------------------------------------------------------

const optionalMoney = z
  .union([z.number(), z.string(), z.null()])
  .transform((v) => (v === "" || v === null ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && v >= 0 && v <= 100_000_000), "Enter a sale price of zero or more, or leave it empty.");

const optionalTime = z
  .union([z.string(), z.null()])
  .transform((v) => (v ? v.trim() || null : null))
  .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Enter a valid date and time for the sale.")
  .transform((v) => (v ? new Date(v).toISOString() : null));

/** Sale fields on a product or variant, as the products API receives them. Only fields that were sent are returned. */
export const saleWriteSchema = z
  .object({
    sale_price: optionalMoney.optional(),
    sale_starts_at: optionalTime.optional(),
    sale_ends_at: optionalTime.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.sale_starts_at && s.sale_ends_at && new Date(s.sale_ends_at) <= new Date(s.sale_starts_at)) {
      ctx.addIssue({ code: "custom", path: ["sale_ends_at"], message: "The sale must end after it starts." });
    }
  });

export type SaleWrite = z.infer<typeof saleWriteSchema>;

export const SALE_KEYS = ["sale_price", "sale_starts_at", "sale_ends_at"] as const;

/** Whether a body sets any sale field to a value (clearing a sale is always allowed). */
export function setsASale(body: Record<string, unknown> | null | undefined) {
  if (!body) return false;
  return body.sale_price != null && body.sale_price !== "";
}
