import { DEFAULT_SHOP_CURRENCY } from "@/lib/shop/tenants";

/** Paystack amounts are always in the currency's smallest subunit (e.g. kobo
 * for NGN, cents for USD) -- this is the single most common Paystack
 * integration bug, so it gets one shared helper instead of inline `* 100`
 * math scattered across the checkout/verify/webhook routes. */
export function toSubunitAmount(mainUnitAmount: number): number {
  return Math.round(mainUnitAmount * 100);
}

export function fromSubunitAmount(subunitAmount: number): number {
  return Math.round(subunitAmount) / 100;
}

export type CheckoutCustomer = {
  name: string;
  email: string;
  phone?: string;
};

export type CheckoutShippingAddress = {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
};

export type CheckoutItem = {
  productId: string;
  variantId?: string | null;
  quantity: number;
};

/** Every line in a cart must resolve to one currency for a single Paystack
 * transaction. Falls back to the platform default (NGN) when a product's
 * currency is unset; rejects a cart whose lines explicitly disagree rather
 * than silently picking one. */
export function resolveCartCurrency(productCurrencies: Array<string | null | undefined>): string {
  const explicit = new Set(productCurrencies.filter((c): c is string => Boolean(c)));

  if (explicit.size > 1) {
    throw new Error("Cart items are priced in different currencies. Please check out separately.");
  }

  return explicit.values().next().value || DEFAULT_SHOP_CURRENCY;
}

const ORDER_ERROR_MESSAGES: Record<string, string> = {
  ORDER_EMPTY: "Your cart is empty.",
  CUSTOMER_NAME_REQUIRED: "Please enter your name.",
  CUSTOMER_EMAIL_REQUIRED: "Please enter your email address.",
  PRODUCT_NOT_FOUND: "One of the items in your cart is no longer available.",
  PRODUCT_UNAVAILABLE: "is no longer available.",
  BELOW_MINIMUM_ORDER_QTY: "has a minimum order quantity you haven't met.",
  VARIANT_NOT_FOUND: "The selected option for one item is no longer available.",
  INSUFFICIENT_STOCK: "doesn't have enough stock for the quantity you requested.",
  INVALID_QUANTITY: "One of the quantities in your cart is invalid.",
};

/** Turns a `store.create_guest_order` Postgres exception message (e.g.
 * "INSUFFICIENT_STOCK: Wireless Headphones") into something safe and
 * readable to show a shopper. */
export function mapOrderErrorMessage(rawMessage: string): string {
  const [code, detail] = rawMessage.split(":").map((s) => s.trim());
  const friendly = ORDER_ERROR_MESSAGES[code];
  if (!friendly) return "We couldn't process your order. Please review your cart and try again.";
  return detail ? `${detail} ${friendly}` : friendly.charAt(0).toUpperCase() + friendly.slice(1);
}
