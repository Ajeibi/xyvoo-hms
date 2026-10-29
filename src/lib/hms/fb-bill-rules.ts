/**
 * Service charge, state levy and VAT on an F&B bill. Pure, shared by the POS
 * (estimate), Open orders (breakdown) and the server (the real figures).
 *
 * Order, as on room bills: service charge and levy are worked out on the
 * items; VAT on items + service charge + levy.
 * When menu prices already include the levy and VAT, those are carved out of
 * the items ("included") and only the service charge (and VAT on it) is added.
 */

import { roundMoney } from "@/lib/hms/fb-payment-rules";

export type FbBillRates = {
  service_charge_percent: number;
  levy_percent: number;
  vat_percent: number;
  prices_include_tax: boolean;
};

export type FbBillTotals = {
  itemsTotal: number;
  serviceCharge: number;
  levy: number;
  vat: number;
  /** True when levy and VAT are already inside the item prices. */
  taxIncluded: boolean;
  /** What the guest pays. */
  total: number;
};

export const NO_BILL_CHARGES: FbBillRates = {
  service_charge_percent: 0,
  levy_percent: 0,
  vat_percent: 0,
  prices_include_tax: true,
};

const pct = (n: number) => Math.max(0, Number(n) || 0) / 100;

export function computeBillTotals(itemsTotal: number, rates: FbBillRates): FbBillTotals {
  const items = Math.max(0, roundMoney(itemsTotal));
  const sc = pct(rates.service_charge_percent);
  const levyRate = pct(rates.levy_percent);
  const vatRate = pct(rates.vat_percent);

  if (!rates.prices_include_tax) {
    const serviceCharge = roundMoney(items * sc);
    const levy = roundMoney(items * levyRate);
    const vat = roundMoney((items + serviceCharge + levy) * vatRate);
    return {
      itemsTotal: items,
      serviceCharge,
      levy,
      vat,
      taxIncluded: false,
      total: roundMoney(items + serviceCharge + levy + vat),
    };
  }

  // Prices include levy and VAT: net = items / ((1 + levy) × (1 + VAT)).
  const net = items / ((1 + levyRate) * (1 + vatRate));
  const levy = roundMoney(net * levyRate);
  const vatInPrices = roundMoney(items - roundMoney(net) - levy);
  const serviceCharge = roundMoney(net * sc);
  const vatOnService = roundMoney(serviceCharge * vatRate);
  return {
    itemsTotal: items,
    serviceCharge,
    levy,
    vat: roundMoney(vatInPrices + vatOnService),
    taxIncluded: levyRate > 0 || vatRate > 0,
    total: roundMoney(items + serviceCharge + vatOnService),
  };
}

/** True when the bill has anything beyond the items worth showing. */
export function hasBillCharges(rates: FbBillRates) {
  return rates.service_charge_percent > 0 || rates.levy_percent > 0 || rates.vat_percent > 0;
}

export function clampRate(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value * 100) / 100));
}

export const FB_RATE_LIMITS = { service: 30, levy: 20, vat: 25 } as const;
