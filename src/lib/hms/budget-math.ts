import { addMonths } from "@/lib/hms/accounting-period-utils";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A yearly figure spread over `months` months; the last month takes the rounding so the parts add up. */
export function spreadEvenly(total: number, months = 12): number[] {
  if (months < 1) return [];
  const base = round2(total / months);
  const out = Array.from({ length: months - 1 }, () => base);
  out.push(round2(total - base * (months - 1)));
  return out;
}

export function monthsOfYear(year: number): string[] {
  return Array.from({ length: 12 }, (_, i) => addMonths(`${year}-01-01`, i));
}
