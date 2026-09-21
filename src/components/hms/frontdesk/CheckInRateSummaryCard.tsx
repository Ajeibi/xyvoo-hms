"use client";

import { CheckInFieldInfo } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NIGERIA_VAT_RATE_PERCENT } from "@/lib/hms/nigeria-hospitality-taxes";
import type { HotelPricingSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { WalkInRoomPricingResult } from "@/lib/hms/walk-in-pricing";

/**
 * Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change). Purely
 * a live readout of already-computed pricing state — takes no setters.
 */
export function CheckInRateSummaryCard({
  nightlyBar,
  nights,
  pricing,
  pricingPreview,
}: {
  nightlyBar: number;
  nights: number;
  pricing: HotelPricingSetup;
  pricingPreview: WalkInRoomPricingResult | null;
}) {
  return (
    <aside className="mt-10 space-y-4 lg:sticky lg:top-4 lg:z-10 lg:mt-0 lg:self-start">
      <Card className="border-slate-200 bg-slate-50/50">
        <CardHeader className="border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <CardTitle className="text-base">Rate information</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                BAR uses room type + extra adult/child rates from settings. VAT uses Nigeria{" "}
                <strong>{NIGERIA_VAT_RATE_PERCENT}%</strong> standard rate unless exempt.
              </p>
            </div>
            <CheckInFieldInfo
              label="Rate information"
              text="Live estimate of room revenue after discounts plus service charge, state levy, and VAT. Totals post to folio lines on check-in; disclaimer covers statutory differences."
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              Published BAR / night
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="Published BAR / night"
                text="BAR is Best Available Rate: the standard published nightly rate for this room type for one night, including extra adult/child amounts from hotel pricing settings, before discounts and taxes."
              />
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">
              {formatPricingAmount(nightlyBar, pricing.currency)}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              Room subtotal ({nights} night{nights === 1 ? "" : "s"})
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="Room subtotal"
                text="BAR multiplied by number of nights, before percentage discount. This is pure room rent for the stay length."
              />
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-900">
              {pricingPreview ? formatPricingAmount(pricingPreview.roomSubtotalBeforeDiscount, pricing.currency) : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              Room discount
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="Room discount"
                text="Total monetary reduction from your discount % and scope (e.g. first night only). Shown as a positive amount to subtract from subtotal."
              />
            </span>
            <span className="shrink-0 font-medium tabular-nums text-rose-700">
              {pricingPreview ? `−${formatPricingAmount(pricingPreview.roomDiscountAmount, pricing.currency)}` : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2 border-t border-slate-200 pt-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              Room after discount
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="Room after discount"
                text="Net room revenue used as the base for service charge, state levy, and VAT calculations in this estimate."
              />
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">
              {pricingPreview ? formatPricingAmount(pricingPreview.roomSubtotalAfterDiscount, pricing.currency) : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              Service charge ({pricing.serviceChargeRate}%)
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="Service charge"
                text="Discretionary property percentage from settings, applied to room after discount. Not the same as VAT; can be exempt separately."
              />
            </span>
            <span className="shrink-0 tabular-nums text-slate-800">
              {pricingPreview ? formatPricingAmount(pricingPreview.taxes.serviceChargeAmount, pricing.currency) : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              State / local levy ({pricing.taxRate}%)
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="State / local levy"
                text="Configurable percentage in hotel settings to stand in for state consumption, occupancy, or similar charges—align with your jurisdiction."
              />
            </span>
            <span className="shrink-0 tabular-nums text-slate-800">
              {pricingPreview ? formatPricingAmount(pricingPreview.taxes.stateLevyAmount, pricing.currency) : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2">
            <span className="flex min-w-0 flex-wrap items-center gap-1 text-slate-600">
              VAT ({NIGERIA_VAT_RATE_PERCENT}%)
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="VAT"
                text="Nigerian VAT modelled at 7.5% on the taxable stack (room after discount + service + state levy) unless you tick VAT exempt."
              />
            </span>
            <span className="shrink-0 tabular-nums text-slate-800">
              {pricingPreview ? formatPricingAmount(pricingPreview.taxes.vatAmount, pricing.currency) : "—"}
            </span>
          </div>
          <div className="flex items-start justify-between gap-2 border-t border-slate-200 pt-2 text-base">
            <span className="flex min-w-0 flex-wrap items-center gap-1 font-semibold text-slate-900">
              Estimated total
              <CheckInFieldInfo
                className="h-6 w-6 [&_svg]:size-3.5"
                label="Estimated total"
                text="Sum of discounted room, service charge, state levy, VAT, and any stamp line. Actual folio may differ if staff post adjustments later."
              />
            </span>
            <span className="shrink-0 font-bold tabular-nums text-blue-800">
              {pricingPreview ? formatPricingAmount(pricingPreview.taxes.grandTotal, pricing.currency) : "—"}
            </span>
          </div>
          <p className="flex flex-wrap items-start gap-1 text-[11px] leading-relaxed text-slate-500">
            <span>
              Estimates for front desk. Final statutory treatment depends on your FIRS registration, state rules, and
              supporting documents. Service charge and &quot;tax %&quot; in hotel settings should mirror your
              property&apos;s approved schedule.
            </span>
            <CheckInFieldInfo
              className="h-6 w-6 [&_svg]:size-3.5"
              label="Disclaimer"
              text="Figures are operational estimates for check-in. Your accountant determines final VAT positions, exemptions, and filings with FIRS and state revenue authorities."
            />
          </p>
        </CardContent>
      </Card>
    </aside>
  );
}
