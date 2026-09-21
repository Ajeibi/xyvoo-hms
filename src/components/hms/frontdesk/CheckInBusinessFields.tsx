"use client";

import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { Input } from "@/components/ui/input";

type RateType = "rack" | "corporate" | "walk_in_bar" | "promotional";
type MarketSegment = "transient" | "corporate" | "group" | "government" | "wholesale";
type BookingSource = "walk_in" | "phone" | "referral" | "ota" | "website" | "travel_agent";

/** Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change). */
export function SeasonRateTypeFieldset({
  seasonCode,
  rateType,
  setRateType,
}: {
  seasonCode?: string | null;
  rateType: RateType;
  setRateType: (v: RateType) => void;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Season &amp; rate type</span>
        <CheckInFieldInfo
          label="Season & rate type"
          text="Season or campaign code tags the stay for revenue analysis. Rate type (e.g. walk-in BAR, corporate) tells the PMS how this booking was priced versus rack or promo."
        />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="seasonCode"
            helpTitle="Season / campaign code"
            helpText="Optional internal or marketing code (e.g. PEAK2026). Helps group pickups for reporting; does not change tax math unless you extend rules later."
          >
            Season / campaign code
          </CheckInFieldLabelRow>
          <Input
            id="seasonCode"
            name="seasonCode"
            placeholder="e.g. PEAK2026 or N/A"
            defaultValue={seasonCode ?? undefined}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="rateType"
            helpTitle="Rate type"
            helpText="Commercial category for this rate: walk-in BAR, rack, corporate negotiated, or promotional. Used for reporting and audits."
          >
            Rate type
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="rateType"
            value={rateType}
            onChange={(v) => setRateType(v as RateType)}
            placeholder="Select rate type…"
            options={[
              { value: "walk_in_bar", label: "Walk-in BAR" },
              { value: "rack", label: "Rack" },
              { value: "corporate", label: "Corporate" },
              { value: "promotional", label: "Promotional" },
            ]}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function BusinessSourceFieldset({
  marketSegment,
  setMarketSegment,
  source,
  setSource,
  currency,
  bookingChannel,
  travelAgentName,
  commissionPlan,
  commissionValue,
}: {
  marketSegment: MarketSegment;
  setMarketSegment: (v: MarketSegment) => void;
  source: BookingSource;
  setSource: (v: BookingSource) => void;
  currency: string;
  bookingChannel?: string | null;
  travelAgentName?: string | null;
  commissionPlan?: string | null;
  commissionValue?: number | null;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Business source</span>
        <CheckInFieldInfo
          label="Business source"
          text="Marketing and channel fields: who the guest is (segment), how they found you (source), OTA name, agent, and commission for back-office reconciliation."
        />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="marketSegment"
            helpTitle="Market segment"
            helpText="High-level guest category (transient leisure, corporate, group, government, wholesale). Feeds STR-style reporting and rate access."
          >
            Market segment
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="marketSegment"
            value={marketSegment}
            onChange={(v) => setMarketSegment(v as MarketSegment)}
            placeholder="Select segment…"
            options={[
              { value: "transient", label: "Transient" },
              { value: "corporate", label: "Corporate" },
              { value: "group", label: "Group" },
              { value: "government", label: "Government" },
              { value: "wholesale", label: "Wholesale" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="source"
            helpTitle="Source"
            helpText="Booking acquisition channel (walk-in, phone, OTA, website, travel agent). Pair with booking channel for precise attribution."
          >
            Source
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="source"
            value={source}
            onChange={(v) => setSource(v as BookingSource)}
            placeholder="Select source…"
            options={[
              { value: "walk_in", label: "Walk-in" },
              { value: "phone", label: "Phone" },
              { value: "referral", label: "Referral" },
              { value: "ota", label: "OTA" },
              { value: "website", label: "Website" },
              { value: "travel_agent", label: "Travel agent" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="bookingChannel"
            helpTitle="Booking channel / OTA name"
            helpText="Specific marketplace or campaign (e.g. Booking.com, company code). Optional but useful when source is OTA or corporate."
          >
            Booking channel / OTA name
          </CheckInFieldLabelRow>
          <Input
            id="bookingChannel"
            name="bookingChannel"
            placeholder="e.g. Booking.com"
            defaultValue={bookingChannel ?? undefined}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="travelAgentName"
            helpTitle="Travel agent name"
            helpText="Agency or consultant credited with the booking when source is travel agent; supports commission tracking."
          >
            Travel agent name
          </CheckInFieldLabelRow>
          <Input id="travelAgentName" name="travelAgentName" defaultValue={travelAgentName ?? undefined} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="commissionPlan"
            helpTitle="Commission plan"
            helpText="Internal name of the commission arrangement (e.g. net 15%, flat fee). Links to finance for OTA or agent payouts."
          >
            Commission plan
          </CheckInFieldLabelRow>
          <Input id="commissionPlan" name="commissionPlan" defaultValue={commissionPlan ?? undefined} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="commissionValue"
            helpTitle="Commission value"
            helpText="Monetary commission for this stay in your property currency (amount or calculated payout reference per your policy)."
          >
            Commission value ({currency})
          </CheckInFieldLabelRow>
          <Input
            id="commissionValue"
            name="commissionValue"
            type="number"
            min={0}
            step="0.01"
            defaultValue={commissionValue ?? undefined}
            className="h-10 rounded-xl"
          />
        </div>
      </div>
    </fieldset>
  );
}
