import { formatMoney } from "@/lib/hms/reports/model";

/** Kobo (whole integers) shown as naira with the project's money format; kobo parts are kept when there are any. */
export function formatKobo(kobo: number, currency = "NGN"): string {
  if (kobo % 100 === 0) return formatMoney(kobo / 100, currency);
  const whole = formatMoney(Math.trunc(kobo / 100), currency);
  const cents = String(Math.abs(kobo) % 100).padStart(2, "0");
  return `${whole}.${cents}`;
}
