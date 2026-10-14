import { Clock, Receipt, Scale } from "lucide-react";
import type { HotelPricingSetup } from "@/lib/hms/room-pricing";
import {
  formatPricingAmount,
  formatCurrencySymbol,
  formatPricingTime,
} from "@/lib/hms/room-pricing";
import { HmsCard } from "@/components/hms/hms-ui";
import { HMS_MEANING, type HmsMeaning } from "@/components/hms/meaning";

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
    <HmsCard
      id="hms-pricing-rules"
      title="Pricing rules"
      description="Hotel-wide defaults that keep room pricing, charges and stay policies in line."
      icon={Scale}
      meaning="money"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <RulePanel
          title="Commercial rules"
          icon={Receipt}
          meaning="money"
          rows={[
            { label: "Currency", value: currencySymbol || pricingSetup.currency },
            { label: "Rate range", value: rateBand },
            { label: "Tax rate", value: `${pricingSetup.taxRate}%` },
            { label: "Service charge", value: `${pricingSetup.serviceChargeRate}%` },
          ]}
        />
        <RulePanel
          title="Stay policy"
          icon={Clock}
          meaning="rooms"
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
    </HmsCard>
  );
}

function RulePanel({
  title,
  icon: Icon,
  meaning,
  rows,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  meaning: HmsMeaning;
  rows: Array<{ label: string; value: string }>;
}) {
  const tone = HMS_MEANING[meaning];
  return (
    <div className={`rounded-2xl p-4 ${tone.tint}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-lg shadow-sm ${tone.iconBox}`}>
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h3>
      <dl className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-3 rounded-xl bg-white px-4 py-3">
            <dt className="text-sm text-slate-700">{row.label}</dt>
            <dd className="text-right text-sm font-semibold text-slate-900">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
