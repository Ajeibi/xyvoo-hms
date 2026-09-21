"use client";

import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { Input } from "@/components/ui/input";

/** Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change). */
export function CheckInRegistrationComplianceFieldset({
  showRateOnRegistrationCard,
  generateBill,
  rateOverridden,
  rateOverrideReason,
  immigrationRegistrationRequired,
  vipFlag,
}: {
  showRateOnRegistrationCard?: boolean | null;
  generateBill?: boolean | null;
  rateOverridden?: boolean | null;
  rateOverrideReason?: string | null;
  immigrationRegistrationRequired?: boolean | null;
  vipFlag?: boolean | null;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Registration &amp; compliance</span>
        <CheckInFieldInfo
          label="Registration & compliance"
          text="Controls how the registration card and bill behave, when a manager override applies, immigration follow-up, and VIP handling for service teams."
        />
      </legend>
      <div className="flex items-start gap-2">
        <input
          id="showRateOnRegistrationCard"
          type="checkbox"
          name="showRateOnRegistrationCard"
          defaultChecked={showRateOnRegistrationCard ?? true}
          className="mt-1 rounded border-slate-300"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
          <label htmlFor="showRateOnRegistrationCard">Show rate on registration card</label>
          <CheckInFieldInfo
            label="Show rate on registration card"
            text="When checked, nightly rate or total may print on the guest-facing registration card. Uncheck for discretion or contracted confidentiality."
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <input
          id="generateBill"
          type="checkbox"
          name="generateBill"
          defaultChecked={generateBill ?? true}
          className="mt-1 rounded border-slate-300"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
          <label htmlFor="generateBill">Generate bill number</label>
          <CheckInFieldInfo
            label="Generate bill number"
            text="When checked, the system assigns a folio/bill sequence for this stay so charges can post to a numbered guest bill."
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <input
          id="rateOverridden"
          type="checkbox"
          name="rateOverridden"
          defaultChecked={rateOverridden ?? false}
          className="mt-1 rounded border-slate-300"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
          <label htmlFor="rateOverridden">Override rate (manager policy)</label>
          <CheckInFieldInfo
            label="Override rate"
            text="Marks that the published BAR was changed by policy or manager approval. Always capture a reason when checked for audit."
          />
        </div>
      </div>
      <div className="space-y-2">
        <CheckInFieldLabelRow
          htmlFor="rateOverrideReason"
          helpTitle="Rate override reason"
          helpText="Mandatory narrative when overriding BAR (comp, price match, service recovery). Finance and QA use this during audits."
        >
          Rate override reason
        </CheckInFieldLabelRow>
        <Input id="rateOverrideReason" name="rateOverrideReason" defaultValue={rateOverrideReason ?? undefined} className="h-10 rounded-xl" />
      </div>
      <div className="flex items-start gap-2">
        <input
          id="immigrationRegistrationRequired"
          type="checkbox"
          name="immigrationRegistrationRequired"
          defaultChecked={immigrationRegistrationRequired ?? false}
          className="mt-1 rounded border-slate-300"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
          <label htmlFor="immigrationRegistrationRequired">
            Immigration registration required (non-Nigerian / CERPAC workflow)
          </label>
          <CheckInFieldInfo
            label="Immigration registration"
            text="Flag when Nigerian immigration rules require alien registration or CERPAC follow-up for this guest. Triggers back-office or concierge tasks."
          />
        </div>
      </div>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          id="vipFlag"
          name="vipFlag"
          defaultChecked={vipFlag ?? false}
          className="mt-1 rounded border-slate-300"
        />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
          <label htmlFor="vipFlag">VIP guest</label>
          <CheckInFieldInfo
            label="VIP guest"
            text="High-touch or high-value guest; may drive welcome amenities, alerts to management, and priority on requests."
          />
        </div>
      </div>
    </fieldset>
  );
}
