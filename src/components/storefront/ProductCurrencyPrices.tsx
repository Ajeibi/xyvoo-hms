"use client";

import { convertFromHome, CURRENCY_NAMES, type CurrencySettings, type ShopCurrencyCode } from "@/lib/store/currencies";
import { formatShopCurrency } from "@/lib/shop/format";

/** The shop's currency setup, from GET /api/store/currencies. */
export type StoreCurrencyInfo = {
  homeCurrency: string;
  settings: CurrencySettings;
  liveRates: Record<string, number | null>;
};

/** Form values per currency: blank means "convert automatically". */
export type FixedPriceInputs = Record<string, { price: string; compareAt: string }>;

type PriceRow = { id: string; currency: string; price: number; compare_at_price: number | null };

const inputClass =
  "w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue";

/** Loads a product's fixed prices into form values. */
export async function loadFixedPrices(slug: string, productId: string): Promise<{ inputs: FixedPriceInputs; rows: PriceRow[] }> {
  const res = await fetch(`/api/store/products/${productId}/prices?slug=${encodeURIComponent(slug)}`);
  if (!res.ok) return { inputs: {}, rows: [] };
  const rows = ((await res.json()).prices || []) as PriceRow[];
  const inputs = Object.fromEntries(
    rows.map((r) => [r.currency, { price: String(r.price), compareAt: r.compare_at_price != null ? String(r.compare_at_price) : "" }]),
  );
  return { inputs, rows };
}

/** Saves the product's fixed prices: sets the filled ones and removes any cleared. */
export async function saveFixedPrices(slug: string, productId: string, inputs: FixedPriceInputs, existing: PriceRow[], currencies: string[]) {
  const requests: Promise<Response>[] = [];
  for (const code of currencies) {
    const value = inputs[code];
    const price = value?.price.trim() ? Number(value.price) : null;
    const row = existing.find((r) => r.currency === code);
    if (price != null && Number.isFinite(price) && price >= 0) {
      requests.push(
        fetch(`/api/store/products/${productId}/prices`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, currency: code, price, compare_at_price: value.compareAt.trim() ? Number(value.compareAt) : null }),
        }),
      );
    } else if (row) {
      requests.push(fetch(`/api/store/products/${productId}/prices?slug=${encodeURIComponent(slug)}&itemId=${row.id}`, { method: "DELETE" }));
    }
  }
  const results = await Promise.all(requests);
  if (results.some((r) => !r.ok)) throw new Error("The product saved, but some of its prices in other currencies didn't. Please try again.");
}

/** Pricing tab: the product's price in each of the shop's other currencies. */
export default function ProductCurrencyPrices({
  info,
  basePrice,
  value,
  onChange,
}: {
  info: StoreCurrencyInfo;
  basePrice: number;
  value: FixedPriceInputs;
  onChange: (next: FixedPriceInputs) => void;
}) {
  if (!info.settings.extra.length) return null;

  return (
    <fieldset className="space-y-3 rounded-lg border border-slate-200 p-3 sm:col-span-2">
      <legend className="px-1 text-sm font-medium text-slate-800">Prices in other currencies</legend>
      <p className="text-xs text-slate-600">Leave a price blank to convert it from {info.homeCurrency} automatically. Customers always pay in {info.homeCurrency}.</p>
      {info.settings.extra.map((c) => {
        const rate = c.rateSource === "custom" ? c.customRate : info.liveRates[c.code];
        const converted = rate && basePrice > 0 ? convertFromHome(basePrice, { code: c.code, rate, markupPercent: c.markupPercent, rounding: c.rounding }) : null;
        const current = value[c.code] ?? { price: "", compareAt: "" };
        const set = (patch: Partial<typeof current>) => onChange({ ...value, [c.code]: { ...current, ...patch } });
        const id = `fixed-${c.code}`;
        return (
          <div key={c.code} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-price`} className="mb-1 block text-xs font-medium text-slate-700">
                Price in {c.code} <span className="font-normal text-slate-500">({CURRENCY_NAMES[c.code as ShopCurrencyCode]})</span>
              </label>
              <input
                id={`${id}-price`}
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                placeholder={converted != null ? String(converted) : ""}
                value={current.price}
                onChange={(e) => set({ price: e.target.value })}
                aria-describedby={`${id}-hint`}
              />
              <p id={`${id}-hint`} className="mt-1 text-xs text-slate-500">
                {current.price.trim()
                  ? "Your own price."
                  : converted != null
                    ? `${c.mode === "manual" ? "Not set yet, so it's" : "Converted automatically:"} ${formatShopCurrency(converted, c.code)}${c.mode === "manual" ? " for now." : ""}`
                    : "Converted automatically once there's a rate."}
              </p>
            </div>
            <div>
              <label htmlFor={`${id}-compare`} className="mb-1 block text-xs font-medium text-slate-700">
                Compare-at price in {c.code} <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <input
                id={`${id}-compare`}
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={current.compareAt}
                onChange={(e) => set({ compareAt: e.target.value })}
                disabled={!current.price.trim()}
              />
            </div>
          </div>
        );
      })}
    </fieldset>
  );
}
