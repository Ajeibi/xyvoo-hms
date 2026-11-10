/**
 * Every Nigerian payroll figure the HMS uses, in one place.
 *
 * When a law or rate changes, add a new entry to PAYE_REGIMES (with the date it starts) or
 * change the statutory rates below, and bump RULES_VERSION. Pay runs store the version they
 * were worked out with, so old payslips keep showing what was actually applied.
 *
 * Checked on 2026-11-10. These are not legal advice: have the hotel's accountant confirm them.
 */

export const RULES_VERSION = "NG-2026.1";

export type TaxBand = {
  /** Size of this slice of annual taxable income, in naira. null = everything above. */
  upTo: number | null;
  rate: number;
};

export type PayeRegime = {
  key: "nta2025" | "pita";
  name: string;
  /** First day (inclusive) the regime applies to pay periods. */
  from: string;
  /** Last day (inclusive), or null while it is current. */
  to: string | null;
  bands: TaxBand[];
  /** Consolidated relief allowance (PITA only). */
  cra: { fixed: number; percentOfGrossFloor: number; percentOfGross: number } | null;
  /** Rent relief (Nigeria Tax Act only): a share of annual rent paid, capped. */
  rentRelief: { percent: number; cap: number } | null;
  /** Minimum tax as a share of gross income when banded tax is lower (PITA only). */
  minimumTaxPercent: number | null;
  /** Monthly gross at or below which no PAYE is due. */
  minimumWageMonthly: number;
  source: string;
};

export const PAYE_REGIMES: PayeRegime[] = [
  {
    key: "nta2025",
    name: "Nigeria Tax Act 2025",
    from: "2026-01-01",
    to: null,
    // Fourth Schedule, Nigeria Tax Act 2025 (signed 26 June 2025, in force 1 January 2026).
    // Source: PwC Worldwide Tax Summaries, Nigeria > Individual > Taxes on personal income
    // (https://taxsummaries.pwc.com/nigeria/individual/taxes-on-personal-income, reviewed 29 May 2026),
    // matching DLA Piper Africa, "FAQs on payroll taxes and employer liability" (2026).
    bands: [
      { upTo: 800_000, rate: 0 },
      { upTo: 2_200_000, rate: 0.15 },
      { upTo: 9_000_000, rate: 0.18 },
      { upTo: 13_000_000, rate: 0.21 },
      { upTo: 25_000_000, rate: 0.23 },
      { upTo: null, rate: 0.25 },
    ],
    cra: null,
    // Rent relief replaces the consolidated relief allowance: 20% of annual rent paid, at most
    // ₦500,000 a year. Source: Nigeria Tax Act 2025 (section number to confirm); summarised by DLA Piper Africa (2026)
    // and Mondaq, "Understanding Personal Income Tax Under the Nigerian Tax Act 2025".
    rentRelief: { percent: 0.2, cap: 500_000 },
    // The 1% minimum tax is not carried into the Nigeria Tax Act (PwC, as above).
    minimumTaxPercent: null,
    // Earners of no more than the national minimum wage (₦70,000 a month, National Minimum Wage
    // (Amendment) Act 2024) pay no PAYE. Source: PwC Worldwide Tax Summaries, as above.
    minimumWageMonthly: 70_000,
    source: "Nigeria Tax Act 2025, Fourth Schedule and rent relief; PwC Worldwide Tax Summaries (Nigeria, 2026)",
  },
  {
    key: "pita",
    name: "Personal Income Tax Act (as amended to 2020)",
    from: "2011-01-01",
    to: "2025-12-31",
    // Sixth Schedule, Personal Income Tax (Amendment) Act 2011, used until 31 December 2025.
    bands: [
      { upTo: 300_000, rate: 0.07 },
      { upTo: 300_000, rate: 0.11 },
      { upTo: 500_000, rate: 0.15 },
      { upTo: 500_000, rate: 0.19 },
      { upTo: 1_600_000, rate: 0.21 },
      { upTo: null, rate: 0.24 },
    ],
    // Consolidated relief allowance: the higher of ₦200,000 or 1% of gross income, plus 20% of
    // gross income. PITA as amended by the Personal Income Tax (Amendment) Act 2011 (the CRA section).
    cra: { fixed: 200_000, percentOfGrossFloor: 0.01, percentOfGross: 0.2 },
    rentRelief: null,
    // Minimum tax of 1% of gross income: PITA as amended 2011.
    minimumTaxPercent: 0.01,
    // Finance Act 2020 exempts minimum wage earners; ₦70,000 from July 2024 (₦30,000 before).
    minimumWageMonthly: 70_000,
    source: "Personal Income Tax Act (Cap P8 LFN 2004) as amended 2011 and by the Finance Act 2020",
  },
];

export const STATUTORY = {
  pension: {
    // Pension Reform Act 2014, s.4(1): at least 10% by the employer and 8% by the employee of
    // monthly emoluments. Emoluments = basic salary + housing + transport allowances (PenCom,
    // "Frequently Asked Questions on the Contributory Pension Scheme", reviewed 17 April 2018).
    // Employers with fewer than 3 staff are not bound by the Act; the hotel switches it off in settings.
    employeeRate: 0.08,
    employerRate: 0.1,
    source: "Pension Reform Act 2014, s.4(1); PenCom CPS FAQ (2018)",
  },
  nhf: {
    // National Housing Fund Act 1992: 2.5% of the employee's monthly basic salary, remitted to
    // the Federal Mortgage Bank of Nigeria. For private-sector staff it is in practice voluntary and
    // needs the employee's consent (DLA Piper Africa, 2026), so it is opt-in per person here.
    rate: 0.025,
    source: "National Housing Fund Act 1992; DLA Piper Africa payroll FAQ (2026)",
  },
  nsitf: {
    // Employee's Compensation Act 2010: employers pay 1% of total monthly payroll to
    // the NSITF Employee's Compensation Scheme. Employer cost, never deducted from staff.
    rate: 0.01,
    source: "Employee's Compensation Act 2010 (NSITF ECS)",
  },
  itf: {
    // Industrial Training Fund (Amendment) Act 2011: 1% of annual payroll for employers with
    // 5 or more staff or turnover of ₦50 million or more. Employer cost; accrued monthly here.
    rate: 0.01,
    source: "Industrial Training Fund (Amendment) Act 2011",
  },
} as const;

/** The regime that applies to a pay period, chosen by the period's last day. */
export function payeRegimeFor(periodEnd: string): PayeRegime {
  return (
    PAYE_REGIMES.find((r) => periodEnd >= r.from && (r.to === null || periodEnd <= r.to)) ??
    PAYE_REGIMES[0]
  );
}
