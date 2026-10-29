"use client";

import type { StaySummary } from "@/lib/hms/folio-stay-summary";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

/*
 * The checkout screen's picture of the stay and its bill, in plain words: what was booked, the
 * discount given at check-in, how many nights the guest stayed, and every amount that makes up
 * the balance. Times are wall-clock stored as UTC, like the rest of the front desk.
 */

function day(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function dayAndTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function nights(n: number) {
  return `${n} night${n === 1 ? "" : "s"}`;
}

function shortDate(date: string) {
  return new Date(`${date}T12:00:00.000Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function leavingText(stay: StaySummary) {
  if (stay.nightsIfLeavingNow == null) return null;
  const stayed = stay.nightsIfLeavingNow;
  if (stay.extraNights.nights > 0) {
    return `${nights(stay.bookedNights + stay.extraNights.nights)} in all: ${nights(stay.extraNights.nights)} past departure.`;
  }
  if (stay.earlyCheckout && stay.earlyCheckout.unusedNights > 0) {
    return `${nights(stayed)}, leaving ${stay.earlyCheckout.unusedNights === 1 ? "a night" : nights(stay.earlyCheckout.unusedNights)} early.`;
  }
  return `${nights(Math.min(stayed, stay.bookedNights))}, as booked.`;
}

function Row({ label, detail, amount, currency, credit }: { label: string; detail?: string; amount: number; currency: string; credit?: boolean }) {
  return (
    <tr className="border-t border-slate-100 first:border-0">
      <td className="px-3 py-2 align-top text-slate-800">
        {label}
        {detail ? <span className="block text-xs text-slate-600">{detail}</span> : null}
      </td>
      <td className={`whitespace-nowrap px-3 py-2 text-right align-top tabular-nums ${credit ? "text-emerald-700" : "text-slate-900"}`}>
        {credit ? `− ${formatPricingAmount(Math.abs(amount), currency)}` : formatPricingAmount(amount, currency)}
      </td>
    </tr>
  );
}

export function CheckoutStayBill({
  stay,
  currency,
  toAccounts = [],
}: {
  stay: StaySummary;
  currency: string;
  /** Parts of the bill sent to company accounts at check-out. */
  toAccounts?: { window: string; payerName: string; amount: number }[];
}) {
  const leaving = leavingText(stay);
  const discount = stay.checkInDiscount;
  const leftToPay = Math.round((stay.balanceAtCheckout - toAccounts.reduce((s, a) => s + a.amount, 0)) * 100) / 100;

  return (
    <div className="space-y-4">
      <section aria-labelledby="checkout-stay-heading" className="rounded-xl border border-slate-200 text-sm">
        <h3 id="checkout-stay-heading" className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-semibold text-slate-800">
          The stay
        </h3>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 px-3 py-3">
          <dt className="text-slate-600">Booked</dt>
          <dd className="text-slate-900">
            {nights(stay.bookedNights)}
            {stay.arrivalDate ? `, ${day(stay.arrivalDate)} to ${day(stay.departureDate)}` : `, leaving ${day(stay.departureDate)}`}
          </dd>
          <dt className="text-slate-600">Checked in</dt>
          <dd className="text-slate-900">{dayAndTime(stay.checkedInAt)}</dd>
          {leaving ? (
            <>
              <dt className="text-slate-600">If they leave now</dt>
              <dd className="text-slate-900">{leaving}</dd>
            </>
          ) : null}
          <dt className="text-slate-600">Room rate</dt>
          <dd className="text-slate-900">
            {stay.nightlyRate > 0 ? `${formatPricingAmount(stay.nightlyRate, currency)} a night, before discount and taxes` : "Not recorded"}
            {stay.rateOverridden ? (
              <span className="block text-xs text-amber-800">
                Rate changed by staff{stay.rateOverrideReason ? `: ${stay.rateOverrideReason}` : ""}
              </span>
            ) : null}
          </dd>
          <dt className="text-slate-600">Discount at check-in</dt>
          <dd className="text-slate-900">
            {discount
              ? `${discount.percent}% off ${discount.nightsLabel}, saving ${formatPricingAmount(discount.amount, currency)}`
              : "None recorded"}
          </dd>
        </dl>
      </section>

      <section aria-labelledby="checkout-bill-heading" className="overflow-hidden rounded-xl border border-slate-200 text-sm">
        <h3 id="checkout-bill-heading" className="border-b border-slate-100 bg-slate-50 px-3 py-2 font-semibold text-slate-800">
          The bill
        </h3>
        <table className="w-full">
          <caption className="sr-only">What makes up the balance</caption>
          <tbody>
            {stay.booked.room !== 0 ? (
              <Row
                label={`Room, ${nights(stay.bookedNights)} booked`}
                detail={discount ? `After the ${discount.percent}% discount` : undefined}
                amount={stay.booked.room}
                currency={currency}
              />
            ) : null}
            {stay.booked.taxes !== 0 ? (
              <Row label="Service charge, levy and VAT on the room" amount={stay.booked.taxes} currency={currency} />
            ) : null}
            {stay.extraNights.nights > 0 ? (
              <Row
                label={`Extra nights, ${nights(stay.extraNights.nights)}`}
                detail={`Stayed past departure${
                  stay.extraNights.from && stay.extraNights.to
                    ? `: ${shortDate(stay.extraNights.from)}${stay.extraNights.to !== stay.extraNights.from ? ` to ${shortDate(stay.extraNights.to)}` : ""}`
                    : ""
                }, with taxes`}
                amount={stay.extraNights.total}
                currency={currency}
              />
            ) : null}
            {stay.earlyCheckout ? (
              <Row
                label={`Credit for ${stay.earlyCheckout.unusedNights === 1 ? "the unused night" : `${nights(stay.earlyCheckout.unusedNights)} not used`}`}
                detail={stay.earlyCheckout.applied ? "Leaving early" : "Leaving early: taken off when you complete the check-out"}
                amount={stay.earlyCheckout.credit}
                currency={currency}
                credit
              />
            ) : null}
            {stay.extras.map((e) => (
              <Row key={e.label} label={e.label} detail={e.count > 1 ? `${e.count} charges` : undefined} amount={e.total} currency={currency} />
            ))}
            {stay.transfers.map((t) => (
              <Row key={t.id} label={t.description} amount={t.amount} currency={currency} credit={t.amount < 0} />
            ))}
            {stay.discounts.map((d) => (
              <Row
                key={d.id}
                label={d.description.startsWith("Discount") ? d.description : `Discount: ${d.description}`}
                detail={`Given ${day(d.createdAt)}${d.withTaxes ? ", with the taxes on it" : ""}`}
                amount={d.amount}
                currency={currency}
                credit
              />
            ))}
            {stay.payments.map((p) => (
              <Row key={p.id} label={`Paid, ${p.method.toLowerCase()}`} detail={dayAndTime(p.createdAt)} amount={p.amount} currency={currency} credit />
            ))}
            {toAccounts.map((a) => (
              <Row key={`account-${a.window}`} label={`Billed to ${a.payerName}`} detail="Sent to their company account at check-out" amount={a.amount} currency={currency} credit />
            ))}
            {stay.refunds.map((r) => (
              <Row key={r.id} label={r.description} detail={`Handed back ${day(r.createdAt)}`} amount={r.amount} currency={currency} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-200 bg-slate-50">
              <th scope="row" className="px-3 py-2 text-left font-semibold text-slate-900">
                {leftToPay < -0.01 ? "Owed back to the guest" : "Left to pay"}
              </th>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">
                {formatPricingAmount(Math.abs(leftToPay), currency)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
