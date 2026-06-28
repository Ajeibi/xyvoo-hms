/**
 * Nigerian hospitality tax modelling (reference rates for guest folios).
 *
 * **VAT — Value Added Tax (7.5%)**  
 * Standard VAT rate on taxable supplies in Nigeria was revised to **7.5%** (notably from
 * 2020 under Finance Act reforms). Hotels that are VAT-registered generally charge VAT on
 * accommodation and related taxable services; specific exemptions apply by law (e.g. certain
 * exempt supplies, small company thresholds). **Exempt toggles in the UI are operational
 * flags** — staff must hold valid exemption documentation where applicable (`tax_exemption_*`
 * on the reservation).
 *
 * **Service charge**  
 * Not a statutory VAT line item: many Nigerian properties add a **discretionary service
 * charge** (often 5–10%). It is modelled from tenant `pricing_setup.serviceChargeRate`.
 *
 * **State / local consumption or occupancy levies**  
 * Rates and names **vary by state** (e.g. consumption or hospitality-related charges). This
 * layer uses tenant `pricing_setup.taxRate` as a configurable **“state / local levy %”** so
 * each property can align with local rules without hard-coding a state table here.
 *
 * **Stamp duty / processing**  
 * Stamp duties and electronic transfer levies depend on transaction type and thresholds.
 * This module exposes a placeholder **stamp levy** amount (default **0**) for future
 * tenant configuration or fixed per-stay rules.
 *
 * **Computation order (simplified folio model)**  
 * 1. Room taxable base (after night-level % discount).  
 * 2. Service charge % of that base (if not exempt).  
 * 3. State levy % of that base (if not exempt).  
 * 4. VAT at {@link NIGERIA_VAT_RATE} on (base + service + state levy) when VAT is not exempt.  
 *    (This stacks charges for display; your accountant may apply a different ordering — the
 *    snapshot stores each component for audit.)
 */

export const NIGERIA_VAT_RATE_PERCENT = 7.5;

export type NigeriaTaxExemptions = {
  exemptVat: boolean;
  exemptServiceCharge: boolean;
  exemptStateLevy: boolean;
  exemptStampLevy: boolean;
};

export type NigeriaHospitalityTaxInput = {
  /** Room revenue after discounts, before taxes and service charge. */
  roomTaxableBase: number;
  /** Tenant-configured service charge % (industry practice, not VAT). */
  serviceChargeRatePercent: number;
  /** Tenant-configured state / local levy % (varies by state). */
  stateLevyRatePercent: number;
  /** Optional stamp / processing amount (currency units), default 0. */
  stampLevyAmount?: number;
  exemptions: NigeriaTaxExemptions;
};

export type NigeriaHospitalityTaxBreakdown = {
  roomTaxableBase: number;
  serviceChargeRatePercent: number;
  serviceChargeAmount: number;
  stateLevyRatePercent: number;
  stateLevyAmount: number;
  vatRatePercent: number;
  vatAmount: number;
  stampLevyAmount: number;
  /** Room + service + state + VAT + stamp */
  grandTotal: number;
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export function computeNigeriaHospitalityTaxes(input: NigeriaHospitalityTaxInput): NigeriaHospitalityTaxBreakdown {
  const base = Math.max(0, roundMoney(input.roomTaxableBase));
  const serviceChargeAmount = input.exemptions.exemptServiceCharge
    ? 0
    : roundMoney((base * Math.max(0, input.serviceChargeRatePercent)) / 100);
  const stateLevyAmount = input.exemptions.exemptStateLevy
    ? 0
    : roundMoney((base * Math.max(0, input.stateLevyRatePercent)) / 100);
  const stampLevyAmount = input.exemptions.exemptStampLevy
    ? 0
    : roundMoney(Math.max(0, input.stampLevyAmount ?? 0));

  const preVatStack = roundMoney(base + serviceChargeAmount + stateLevyAmount);
  const vatAmount = input.exemptions.exemptVat
    ? 0
    : roundMoney((preVatStack * NIGERIA_VAT_RATE_PERCENT) / 100);

  const grandTotal = roundMoney(preVatStack + vatAmount + stampLevyAmount);

  return {
    roomTaxableBase: base,
    serviceChargeRatePercent: input.serviceChargeRatePercent,
    serviceChargeAmount,
    stateLevyRatePercent: input.stateLevyRatePercent,
    stateLevyAmount,
    vatRatePercent: NIGERIA_VAT_RATE_PERCENT,
    vatAmount,
    stampLevyAmount,
    grandTotal,
  };
}
