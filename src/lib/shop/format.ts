export function formatShopCurrency(value: number, currency: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}
