import { z } from "zod";

/*
 * Tax (VAT and the like). A shop either doesn't charge tax, or charges one
 * rate, with its prices either already including it (the tax is worked out
 * for the receipt only) or having it added at checkout. Each product can be
 * left out (not taxable) or put in a class: standard uses the shop's rate,
 * zero-rated and exempt are 0%. Tax is worked out per line, after discounts.
 * No server code, so the dashboard, checkout page and checkout API share it.
 */

export const TAX_CLASSES = ["standard", "zero", "exempt"] as const;
export type TaxClass = (typeof TAX_CLASSES)[number];

export const TAX_CLASS_LABELS: Record<TaxClass, string> = {
  standard: "Standard rate",
  zero: "Zero-rated (0%)",
  exempt: "Exempt",
};

export type TaxSettings = {
  enabled: boolean;
  /** What the shop calls it, e.g. "VAT". */
  name: string;
  /** Percent, e.g. 7.5. */
  rate: number;
  /** Prices already include tax (true), or tax is added at checkout (false). */
  inclusive: boolean;
  /** Registration number shown on receipts. */
  number: string | null;
  /** Whether delivery charges are taxed too. */
  onDelivery: boolean;
};

export const NO_TAX: TaxSettings = { enabled: false, name: "VAT", rate: 0, inclusive: true, number: null, onDelivery: false };

export const TAX_COLUMNS = "tax_enabled, tax_name, tax_rate, tax_inclusive, tax_number, tax_on_delivery";

export type TaxSettingsRow = {
  tax_enabled: boolean | null;
  tax_name: string | null;
  tax_rate: number | string | null;
  tax_inclusive: boolean | null;
  tax_number: string | null;
  tax_on_delivery: boolean | null;
};

export function mapTaxSettings(row: TaxSettingsRow | null | undefined): TaxSettings {
  if (!row) return NO_TAX;
  const rate = Number(row.tax_rate) || 0;
  return {
    enabled: Boolean(row.tax_enabled) && rate > 0,
    name: row.tax_name?.trim() || "VAT",
    rate,
    inclusive: row.tax_inclusive ?? true,
    number: row.tax_number?.trim() || null,
    onDelivery: Boolean(row.tax_on_delivery),
  };
}

export const taxSettingsSchema = z
  .object({
    enabled: z.boolean(),
    name: z.string().trim().max(30, "Keep the name under 30 characters.").optional().transform((v) => v || "VAT"),
    rate: z.coerce.number().min(0, "The rate can't be negative.").max(100, "The rate can't be more than 100%."),
    inclusive: z.boolean(),
    number: z.string().trim().max(60, "Keep the registration number under 60 characters.").optional().nullable().transform((v) => v || null),
    onDelivery: z.boolean().default(false),
  })
  .superRefine((s, ctx) => {
    if (s.enabled && !(s.rate > 0)) ctx.addIssue({ code: "custom", path: ["rate"], message: "Enter the rate you charge, for example 7.5." });
  });

export type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;

export function toTaxRow(input: TaxSettingsInput) {
  return {
    tax_enabled: input.enabled,
    tax_name: input.name,
    tax_rate: Math.round(input.rate * 100) / 100,
    tax_inclusive: input.inclusive,
    tax_number: input.number,
    tax_on_delivery: input.onDelivery,
  };
}

/** The rate for one product: 0 when the shop doesn't charge tax, the product isn't taxable, or its class is zero-rated or exempt. */
export function lineTaxRate(settings: TaxSettings, product: { taxable?: boolean | null; taxClass?: string | null }) {
  if (!settings.enabled) return 0;
  if (product.taxable === false) return 0;
  const cls = (product.taxClass || "standard").trim().toLowerCase();
  if (cls === "zero" || cls === "exempt") return 0;
  return settings.rate;
}

/** "VAT (7.5%)" */
export function taxLabel(settings: Pick<TaxSettings, "name" | "rate">) {
  return `${settings.name} (${trimNumber(settings.rate)}%)`;
}

export type TaxLine = {
  /** What the line costs before any discount. */
  lineTotal: number;
  /** This line's share of the discount. */
  discount: number;
  /** Percent from lineTaxRate. */
  rate: number;
};

export type TaxResult = {
  /** All the tax on the order, to 2 decimal places. */
  amount: number;
  /** Of which, on the items. */
  itemsTax: number;
  /** Of which, on delivery. */
  deliveryTax: number;
  /** Already in the prices (true), or to add to the total (false). */
  inclusive: boolean;
  /** The shop's rate, or null when no tax applies. */
  rate: number | null;
};

/**
 * The tax on an order. With prices that include tax, it is taken out of each
 * line for display (total unchanged); otherwise it is added to the total.
 */
export function computeTax(settings: TaxSettings, lines: TaxLine[], deliveryFee: number): TaxResult {
  if (!settings.enabled) return { amount: 0, itemsTax: 0, deliveryTax: 0, inclusive: false, rate: null };
  const part = (base: number, rate: number) => {
    if (!(base > 0) || !(rate > 0)) return 0;
    return settings.inclusive ? (base * rate) / (100 + rate) : (base * rate) / 100;
  };
  const items = lines.reduce((sum, l) => sum + part(l.lineTotal - l.discount, l.rate), 0);
  const delivery = settings.onDelivery ? part(deliveryFee, settings.rate) : 0;
  const itemsTax = round2(items);
  const deliveryTax = round2(delivery);
  return { amount: round2(itemsTax + deliveryTax), itemsTax, deliveryTax, inclusive: settings.inclusive, rate: settings.rate };
}

/**
 * Splits a discount across the lines it applies to, in proportion to what
 * each costs, so tax can be worked out per line after the discount. Pennies
 * left over from rounding go on the last eligible line. `eligible` null
 * means every line.
 */
export function allocateDiscount(lines: Array<{ productId: string; lineTotal: number }>, eligible: string[] | null, amount: number) {
  const shares = lines.map(() => 0);
  if (!(amount > 0)) return shares;
  const allowed = eligible && eligible.length ? new Set(eligible) : null;
  const indexes = lines.map((l, i) => (!allowed || allowed.has(l.productId) ? i : -1)).filter((i) => i >= 0 && lines[i].lineTotal > 0);
  const base = indexes.reduce((sum, i) => sum + lines[i].lineTotal, 0);
  if (!(base > 0)) return shares;
  let given = 0;
  indexes.forEach((i, n) => {
    const share = n === indexes.length - 1 ? round2(Math.min(amount, base) - given) : round2((Math.min(amount, base) * lines[i].lineTotal) / base);
    shares[i] = share;
    given = round2(given + share);
  });
  return shares;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const trimNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, ""));
