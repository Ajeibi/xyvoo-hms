"use client";

import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { useEffect, useState } from "react";
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
  bookingChannel,
  slug,
  travelAgentId,
}: {
  marketSegment: MarketSegment;
  setMarketSegment: (v: MarketSegment) => void;
  source: BookingSource;
  setSource: (v: BookingSource) => void;
  bookingChannel?: string | null;
  slug: string;
  travelAgentId?: string | null;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Business source</span>
        <CheckInFieldInfo
          label="Business source"
          text="Who the guest is (segment), how they found you (source), the booking site, and the travel agent who earns commission on the stay."
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
        <TravelAgentSelect slug={slug} initialId={travelAgentId ?? null} />
      </div>
    </fieldset>
  );
}

/**
 * The travel agent who earns commission on this stay, from the hotel's list (Reservations,
 * Settings). Their rate is kept on the stay, and the commission is billed at check-out.
 */
function TravelAgentSelect({ slug, initialId }: { slug: string; initialId: string | null }) {
  const [agents, setAgents] = useState<{ id: string; name: string; commissionPercent: number }[]>([]);
  const [value, setValue] = useState(initialId ?? "");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/travel-agents?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setAgents(data.agents ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <div className="space-y-2 sm:col-span-2">
      <CheckInFieldLabelRow
        htmlFor="travelAgentId"
        helpTitle="Travel agent"
        helpText="The agent or booking site that earns commission on this stay. Their commission is worked out on the room at check-out and sent to Accounts as a bill to pay. Add agents under Reservations, Settings."
      >
        Travel agent (earns commission)
      </CheckInFieldLabelRow>
      <select
        id="travelAgentId"
        name="travelAgentId"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-10 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <option value="">None</option>
        {agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.commissionPercent}% of the room)
          </option>
        ))}
      </select>
    </div>
  );
}
