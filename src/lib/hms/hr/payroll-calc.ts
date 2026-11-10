/*
 * Nigerian payroll arithmetic for one person and one month. Pure: no database, so every rule is
 * unit-tested. All figures come from payroll-rules.ts.
 */
import { STATUTORY, payeRegimeFor, type PayeRegime, type TaxBand } from "@/lib/hms/hr/payroll-rules";
import type { PayProfile } from "@/lib/hms/hr/hr-shared";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PayInputs = {
  profile: PayProfile;
  periodEnd: string;
  /** Approved hours in the period, split into regular and overtime. */
  regularHours: number;
  overtimeHours: number;
  overtimeMultiplier: number;
  /** Days actually worked (daily-paid staff). */
  daysWorked: number;
  /** Working days in the period, and unpaid leave days inside it (monthly-paid staff). */
  workingDaysInPeriod: number;
  unpaidLeaveDays: number;
  /** Contracted weekly hours, used to price overtime for monthly staff. */
  contractedHoursWeek: number | null;
  /** One-off additions this month (bonus, arrears). Taxable, not pensionable. */
  oneOffAdditions: number;
  /** Hotel-level switches. */
  pensionEnabled: boolean;
  nsitfEnabled: boolean;
  itfEnabled: boolean;
};

export type PayResult = {
  regime: PayeRegime["key"];
  basic: number;
  housing: number;
  transport: number;
  otherAllowances: number;
  hourlyPay: number;
  dailyPay: number;
  overtimePay: number;
  oneOffAdditions: number;
  unpaidLeaveDeduction: number;
  gross: number;
  pensionBase: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  reliefs: { pension: number; nhf: number; rent: number; cra: number; other: number };
  taxableIncomeAnnual: number;
  payeAnnual: number;
  paye: number;
  payeNote: string | null;
  otherDeductions: number;
  netPay: number;
  nsitf: number;
  itf: number;
  employerCost: number;
};

/** Tax on an annual taxable income through a band table. */
export function bandTax(income: number, bands: TaxBand[]): number {
  let left = Math.max(0, income);
  let tax = 0;
  for (const b of bands) {
    if (left <= 0) break;
    const slice = b.upTo === null ? left : Math.min(left, b.upTo);
    tax += slice * b.rate;
    left -= slice;
  }
  return tax;
}

/**
 * Annual PAYE for an annual gross and the reliefs allowed. Returns the tax, the taxable income and
 * which reliefs were used, under the regime for the period.
 */
export function annualPaye(params: {
  regime: PayeRegime;
  grossAnnual: number;
  pensionAnnual: number;
  nhfAnnual: number;
  rentPaidAnnual: number;
  otherReliefsAnnual: number;
}): { tax: number; taxable: number; rent: number; cra: number; minimumTaxApplied: boolean } {
  const { regime, grossAnnual } = params;
  // Pension and NHF contributions are deducted before tax under both regimes.
  const statutory = params.pensionAnnual + params.nhfAnnual + params.otherReliefsAnnual;
  const rent = regime.rentRelief ? Math.min(params.rentPaidAnnual * regime.rentRelief.percent, regime.rentRelief.cap) : 0;
  const cra = regime.cra
    ? Math.max(regime.cra.fixed, grossAnnual * regime.cra.percentOfGrossFloor) + grossAnnual * regime.cra.percentOfGross
    : 0;
  const taxable = Math.max(0, grossAnnual - statutory - rent - cra);
  let tax = bandTax(taxable, regime.bands);
  let minimumTaxApplied = false;
  if (regime.minimumTaxPercent !== null) {
    const minimum = grossAnnual * regime.minimumTaxPercent;
    if (tax < minimum) {
      tax = minimum;
      minimumTaxApplied = true;
    }
  }
  return { tax, taxable, rent, cra, minimumTaxApplied };
}

export function calculatePay(input: PayInputs): PayResult {
  const p = input.profile;
  const regime = payeRegimeFor(input.periodEnd);

  let basic = 0;
  let housing = 0;
  let transport = 0;
  let otherAllowances = 0;
  let hourlyPay = 0;
  let dailyPay = 0;
  let overtimePay = 0;
  let unpaidLeaveDeduction = 0;

  if (p.payBasis === "monthly") {
    basic = p.basicMonthly;
    housing = p.housingMonthly;
    transport = p.transportMonthly;
    otherAllowances = p.otherAllowancesMonthly;
    const monthly = basic + housing + transport + otherAllowances;
    if (input.unpaidLeaveDays > 0 && input.workingDaysInPeriod > 0) {
      // Unpaid leave comes off each part in proportion, so pension and NHF bases fall with it.
      const share = Math.min(1, input.unpaidLeaveDays / input.workingDaysInPeriod);
      unpaidLeaveDeduction = monthly * share;
      basic -= basic * share;
      housing -= housing * share;
      transport -= transport * share;
      otherAllowances -= otherAllowances * share;
    }
    if (input.overtimeHours > 0) {
      const weekly = input.contractedHoursWeek && input.contractedHoursWeek > 0 ? input.contractedHoursWeek : 40;
      const hourly = (p.basicMonthly + p.housingMonthly + p.transportMonthly) / ((weekly * 52) / 12);
      overtimePay = hourly * input.overtimeMultiplier * input.overtimeHours;
    }
  } else if (p.payBasis === "hourly") {
    hourlyPay = p.hourlyRate * input.regularHours;
    overtimePay = p.hourlyRate * input.overtimeMultiplier * input.overtimeHours;
    otherAllowances = p.otherAllowancesMonthly;
  } else {
    dailyPay = p.dailyRate * input.daysWorked;
    otherAllowances = p.otherAllowancesMonthly;
  }

  const gross = basic + housing + transport + otherAllowances + hourlyPay + dailyPay + overtimePay + input.oneOffAdditions;

  // Pension base: basic + housing + transport. Hourly and daily pay has no split, so all of it counts.
  const pensionBase = p.payBasis === "monthly" ? basic + housing + transport : hourlyPay + dailyPay;
  const pensionOn = input.pensionEnabled && p.pensionOptIn;
  const pensionEmployee = pensionOn ? pensionBase * STATUTORY.pension.employeeRate : 0;
  const pensionEmployer = pensionOn ? pensionBase * STATUTORY.pension.employerRate : 0;

  const nhfBase = p.payBasis === "monthly" ? basic : hourlyPay + dailyPay;
  const nhf = p.nhfOptIn ? nhfBase * STATUTORY.nhf.rate : 0;

  let paye = 0;
  let payeAnnual = 0;
  let taxableIncomeAnnual = 0;
  let payeNote: string | null = null;
  let rent = 0;
  let cra = 0;
  if (p.payeExempt) {
    payeNote = "Marked as exempt from PAYE.";
  } else if (gross <= regime.minimumWageMonthly) {
    payeNote = `Earns no more than the minimum wage (₦${regime.minimumWageMonthly.toLocaleString("en-NG")} a month), so no PAYE.`;
  } else {
    // Regular pay is taxed as if earned all year, then divided by 12. A one-off payment is
    // added to that year once (not 12 times), and the extra tax it causes is taken this month.
    const regular = gross - input.oneOffAdditions;
    const year = (oneOff: number) =>
      annualPaye({
        regime,
        grossAnnual: regular * 12 + oneOff,
        pensionAnnual: pensionEmployee * 12,
        nhfAnnual: nhf * 12,
        rentPaidAnnual: p.annualRentPaid,
        otherReliefsAnnual: p.otherReliefsAnnual,
      });
    const base = year(0);
    const withOneOff = input.oneOffAdditions > 0 ? year(input.oneOffAdditions) : base;
    payeAnnual = withOneOff.tax;
    taxableIncomeAnnual = withOneOff.taxable;
    rent = withOneOff.rent;
    cra = withOneOff.cra;
    paye = base.tax / 12 + (withOneOff.tax - base.tax);
    if (withOneOff.minimumTaxApplied) payeNote = "Minimum tax (1% of gross) applied.";
  }

  const otherDeductions = p.monthlyDeductions;
  const netPay = gross - paye - pensionEmployee - nhf - otherDeductions;
  const nsitf = input.nsitfEnabled ? gross * STATUTORY.nsitf.rate : 0;
  const itf = input.itfEnabled ? gross * STATUTORY.itf.rate : 0;

  return {
    regime: regime.key,
    basic: r2(basic),
    housing: r2(housing),
    transport: r2(transport),
    otherAllowances: r2(otherAllowances),
    hourlyPay: r2(hourlyPay),
    dailyPay: r2(dailyPay),
    overtimePay: r2(overtimePay),
    oneOffAdditions: r2(input.oneOffAdditions),
    unpaidLeaveDeduction: r2(unpaidLeaveDeduction),
    gross: r2(gross),
    pensionBase: r2(pensionBase),
    pensionEmployee: r2(pensionEmployee),
    pensionEmployer: r2(pensionEmployer),
    nhf: r2(nhf),
    reliefs: { pension: r2(pensionEmployee * 12), nhf: r2(nhf * 12), rent: r2(rent), cra: r2(cra), other: r2(p.otherReliefsAnnual) },
    taxableIncomeAnnual: r2(taxableIncomeAnnual),
    payeAnnual: r2(payeAnnual),
    paye: r2(paye),
    payeNote,
    otherDeductions: r2(otherDeductions),
    netPay: r2(netPay),
    nsitf: r2(nsitf),
    itf: r2(itf),
    employerCost: r2(gross + pensionEmployer + nsitf + itf),
  };
}

/** Splits approved hours into regular and overtime: hours over the weekly threshold in each week are overtime. */
export function splitOvertime(weeklyHours: number[], threshold: number): { regular: number; overtime: number } {
  let regular = 0;
  let overtime = 0;
  for (const h of weeklyHours) {
    regular += Math.min(h, threshold);
    overtime += Math.max(0, h - threshold);
  }
  return { regular: r2(regular), overtime: r2(overtime) };
}

export type PayRunTotals = {
  people: number;
  gross: number;
  paye: number;
  pensionEmployee: number;
  pensionEmployer: number;
  nhf: number;
  nsitf: number;
  itf: number;
  otherDeductions: number;
  netPay: number;
  employerCost: number;
};

export function sumPayslips(slips: Pick<PayResult, "gross" | "paye" | "pensionEmployee" | "pensionEmployer" | "nhf" | "nsitf" | "itf" | "otherDeductions" | "netPay" | "employerCost">[]): PayRunTotals {
  const t: PayRunTotals = { people: slips.length, gross: 0, paye: 0, pensionEmployee: 0, pensionEmployer: 0, nhf: 0, nsitf: 0, itf: 0, otherDeductions: 0, netPay: 0, employerCost: 0 };
  for (const s of slips) {
    t.gross += s.gross;
    t.paye += s.paye;
    t.pensionEmployee += s.pensionEmployee;
    t.pensionEmployer += s.pensionEmployer;
    t.nhf += s.nhf;
    t.nsitf += s.nsitf;
    t.itf += s.itf;
    t.otherDeductions += s.otherDeductions;
    t.netPay += s.netPay;
    t.employerCost += s.employerCost;
  }
  for (const k of Object.keys(t) as (keyof PayRunTotals)[]) if (k !== "people") t[k] = r2(t[k]);
  return t;
}

/**
 * The journal a pay run posts when approved. Debits the payroll expense with everything the hotel
 * bears; credits PAYE to taxes payable, statutory contributions and deductions to accrued
 * expenses, and net pay to the net pay account. Always balanced.
 */
export function payRunJournalLines(t: PayRunTotals): { key: "expense" | "paye" | "statutory" | "net"; debit: number; credit: number; description: string }[] {
  const statutory = r2(t.pensionEmployee + t.pensionEmployer + t.nhf + t.nsitf + t.itf + t.otherDeductions);
  // The expense is the sum of the credits, so any kobo of rounding lands on the expense and the
  // net pay line always equals the net pay later paid out of the bank.
  const expense = r2(t.paye + statutory + t.netPay);
  const lines = [
    { key: "expense" as const, debit: expense, credit: 0, description: "Salaries, wages and employer contributions" },
    { key: "paye" as const, debit: 0, credit: t.paye, description: "PAYE withheld" },
    { key: "statutory" as const, debit: 0, credit: statutory, description: "Pension, NHF, NSITF, ITF and staff deductions" },
    { key: "net" as const, debit: 0, credit: t.netPay, description: "Net pay owed to staff" },
  ];
  return lines.filter((l) => l.debit > 0 || l.credit > 0);
}
