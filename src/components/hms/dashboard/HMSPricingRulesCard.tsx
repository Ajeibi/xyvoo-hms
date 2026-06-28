import type { HotelPricingSetup } from "@/lib/hms/room-pricing";
import {
  formatPricingAmount,
  formatCurrencySymbol,
  formatPricingTime,
} from "@/lib/hms/room-pricing";

type RoomPricingSummary = {
  lowestRate: number | null;
  highestRate: number | null;
};

export default function HMSPricingRulesCard({
  pricingSetup,
  summary,
}: {
  pricingSetup: HotelPricingSetup;
  summary: RoomPricingSummary;
}) {
  const rateBand =
    summary.lowestRate !== null
      ? `${formatPricingAmount(summary.lowestRate, pricingSetup.currency)} - ${formatPricingAmount(summary.highestRate, pricingSetup.currency)}`
      : "Not configured";
  const currencySymbol = formatCurrencySymbol(pricingSetup.currency);

  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Pricing Rules</h2>
        <p className="mt-1 text-sm leading-6 text-slate-500">
          Hotel-wide defaults that keep room pricing, charges, and stay policies aligned.
        </p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <RulePanel
          title="Commercial Rules"
          rows={[
            { label: "Currency", value: currencySymbol || pricingSetup.currency },
            { label: "Rate range", value: rateBand },
            { label: "Tax rate", value: `${pricingSetup.taxRate}%` },
            { label: "Service charge", value: `${pricingSetup.serviceChargeRate}%` },
          ]}
        />
        <RulePanel
          title="Stay Policy"
          rows={[
            {
              label: "Extra adult",
              value: formatPricingAmount(pricingSetup.extraAdultRate, pricingSetup.currency),
            },
            {
              label: "Extra child",
              value: formatPricingAmount(pricingSetup.extraChildRate, pricingSetup.currency),
            },
            { label: "Check-in", value: formatPricingTime(pricingSetup.checkInTime) },
            { label: "Check-out", value: formatPricingTime(pricingSetup.checkOutTime) },
          ]}
        />
      </div>
    </section>
  );
}

function RulePanel({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <div className="mt-4 space-y-3">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 rounded-xl border border-white/80 bg-white px-4 py-3"
          >
            <p className="text-sm text-slate-500">{row.label}</p>
            <p className="text-sm font-semibold text-right text-slate-900">{row.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
