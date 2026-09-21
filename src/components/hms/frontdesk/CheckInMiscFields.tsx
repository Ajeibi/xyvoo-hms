"use client";

import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { Input } from "@/components/ui/input";
import { NIGERIA_VAT_RATE_PERCENT } from "@/lib/hms/nigeria-hospitality-taxes";

/**
 * Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change): each
 * section here was already self-contained enough to lift as-is, taking only the specific
 * controlled values/setters or defaultValues it renders. Field `name` attributes are unchanged,
 * so the parent's FormData-based submit handler keeps working without modification.
 */
export function TaxExemptionsFieldset({
  taxExemptVat,
  setTaxExemptVat,
  taxExemptService,
  setTaxExemptService,
  taxExemptState,
  setTaxExemptState,
  taxExemptStamp,
  setTaxExemptStamp,
  taxExemptionReason,
  taxExemptionDocRef,
  fieldClass,
}: {
  taxExemptVat: boolean;
  setTaxExemptVat: (v: boolean) => void;
  taxExemptService: boolean;
  setTaxExemptService: (v: boolean) => void;
  taxExemptState: boolean;
  setTaxExemptState: (v: boolean) => void;
  taxExemptStamp: boolean;
  setTaxExemptStamp: (v: boolean) => void;
  taxExemptionReason?: string | null;
  taxExemptionDocRef?: string | null;
  fieldClass: string;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Tax exemptions (Nigeria-aligned labels)</span>
        <CheckInFieldInfo
          label="Tax exemptions"
          text="Toggle when this folio should not include VAT, service charge, state levy, or stamp lines. Only use with valid documentation; capture reason and reference below for audit."
        />
      </legend>
      <p className="text-xs text-slate-600">
        <strong>VAT ({NIGERIA_VAT_RATE_PERCENT}%)</strong> — federal Value Added Tax on the taxable hospitality
        base. <strong>Service charge</strong> — discretionary property charge (from your settings %, not VAT).
        <strong> State / local levy</strong> — uses &quot;Tax %&quot; in hotel pricing settings for
        state-specific consumption or occupancy charges. <strong>Stamp / processing</strong> — reserved for
        stamp or processing rules (currently 0 unless you extend rates).
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-start gap-2">
          <input
            id="taxExemptVat"
            type="checkbox"
            className="mt-1 rounded border-slate-300"
            checked={taxExemptVat}
            onChange={(e) => setTaxExemptVat(e.target.checked)}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
            <label htmlFor="taxExemptVat">Exempt VAT (7.5%)</label>
            <CheckInFieldInfo
              label="Exempt VAT"
              text="Do not calculate Nigerian VAT (7.5% in this system) on the folio. Use only when legally exempt and documented."
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="taxExemptService"
            type="checkbox"
            className="mt-1 rounded border-slate-300"
            checked={taxExemptService}
            onChange={(e) => setTaxExemptService(e.target.checked)}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
            <label htmlFor="taxExemptService">Exempt service charge</label>
            <CheckInFieldInfo
              label="Exempt service charge"
              text="Skip the discretionary property service charge from hotel settings. Not the same as VAT; use for agreed comps or packages."
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="taxExemptState"
            type="checkbox"
            className="mt-1 rounded border-slate-300"
            checked={taxExemptState}
            onChange={(e) => setTaxExemptState(e.target.checked)}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
            <label htmlFor="taxExemptState">Exempt state / local levy</label>
            <CheckInFieldInfo
              label="Exempt state / local levy"
              text="Skip the configurable state or local percentage from hotel pricing settings. Rates vary by jurisdiction—align with your counsel."
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <input
            id="taxExemptStamp"
            type="checkbox"
            className="mt-1 rounded border-slate-300"
            checked={taxExemptStamp}
            onChange={(e) => setTaxExemptStamp(e.target.checked)}
          />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
            <label htmlFor="taxExemptStamp">Exempt stamp / processing</label>
            <CheckInFieldInfo
              label="Exempt stamp / processing"
              text="Reserved for stamp duty or processing fees when you add them to the model. Currently typically zero; toggle for future rules."
            />
          </div>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="taxExemptionReason"
            helpTitle="Exemption reason (audit)"
            helpText="Short narrative why tax or charges are not applied (e.g. diplomatic note, medical exemption). Required for internal audit in many hotels."
          >
            Exemption reason (audit)
          </CheckInFieldLabelRow>
          <textarea
            id="taxExemptionReason"
            name="taxExemptionReason"
            rows={2}
            className={fieldClass}
            placeholder="e.g. Diplomatic note, statutory small supplier, medical…"
            defaultValue={taxExemptionReason ?? undefined}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="taxExemptionDocRef"
            helpTitle="Exemption document ref."
            helpText="Reference number or file ID for the supporting exemption letter or certificate. Links the folio to proof if authorities ask."
          >
            Exemption document ref.
          </CheckInFieldLabelRow>
          <Input
            id="taxExemptionDocRef"
            name="taxExemptionDocRef"
            defaultValue={taxExemptionDocRef ?? undefined}
            className="h-10 rounded-xl"
          />
        </div>
      </div>
    </fieldset>
  );
}

export function ReleaseExtensionFieldset({
  currency,
  guaranteeReleaseDate,
  minPaymentPerDayToExtend,
}: {
  currency: string;
  guaranteeReleaseDate?: string | null;
  minPaymentPerDayToExtend?: number | null;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Release &amp; extension</span>
        <CheckInFieldInfo
          label="Release & extension"
          text="Controls for guarantee release and minimum cash required before extending a stay—protects the hotel when guests stay on without a fresh deposit."
        />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="guaranteeReleaseDate"
            helpTitle="Guarantee release date"
            helpText="Date by which an unpaid guarantee or tentative block may be released per your policy (e.g. no-show window)."
          >
            Guarantee release date
          </CheckInFieldLabelRow>
          <Input
            id="guaranteeReleaseDate"
            name="guaranteeReleaseDate"
            type="date"
            defaultValue={guaranteeReleaseDate ?? undefined}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="minPaymentPerDayToExtend"
            helpTitle="Min. payment / day to extend"
            helpText="Minimum amount the guest must pay per day (or per extension) before front desk may add nights—reduces credit risk."
          >
            Min. payment / day to extend ({currency})
          </CheckInFieldLabelRow>
          <Input
            id="minPaymentPerDayToExtend"
            name="minPaymentPerDayToExtend"
            type="number"
            min={0}
            step="0.01"
            defaultValue={minPaymentPerDayToExtend ?? undefined}
            className="h-10 rounded-xl"
            placeholder="0"
          />
        </div>
      </div>
    </fieldset>
  );
}

export function GuestRemarksFieldset({
  fieldClass,
  guestRemarksReservation,
  guestRemarksCheckIn,
  guestRemarksCheckOut,
}: {
  fieldClass: string;
  guestRemarksReservation?: string | null;
  guestRemarksCheckIn?: string | null;
  guestRemarksCheckOut?: string | null;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Guest remarks</span>
        <CheckInFieldInfo
          label="Guest remarks"
          text="Operational notes stored by phase of the stay (reservation, check-in, check-out) so the right team sees the right context at the right time."
        />
      </legend>
      <div className="space-y-4">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="guestRemarksReservation"
            helpTitle="Reservation remarks"
            helpText="Notes from booking or pre-arrival (VIP setup, airport pickup, rate promises). Visible to reservations and front desk."
          >
            Reservation
          </CheckInFieldLabelRow>
          <textarea
            id="guestRemarksReservation"
            name="guestRemarksReservation"
            rows={3}
            className={fieldClass}
            placeholder="Booking / pre-arrival notes…"
            defaultValue={guestRemarksReservation ?? undefined}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="guestRemarksCheckIn"
            helpTitle="Check-in remarks"
            helpText="Notes captured at arrival (preferences, deposit taken, luggage, special requests for housekeeping)."
          >
            Check-in
          </CheckInFieldLabelRow>
          <textarea
            id="guestRemarksCheckIn"
            name="guestRemarksCheckIn"
            rows={3}
            className={fieldClass}
            placeholder="Front desk notes at arrival…"
            defaultValue={guestRemarksCheckIn ?? undefined}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="guestRemarksCheckOut"
            helpTitle="Check-out remarks"
            helpText="Forward-looking notes for departure (late checkout request, transport, wake-up). Helps night audit and morning shift."
          >
            Check-out
          </CheckInFieldLabelRow>
          <textarea
            id="guestRemarksCheckOut"
            name="guestRemarksCheckOut"
            rows={3}
            className={fieldClass}
            placeholder="Expected departure / luggage / late CO…"
            defaultValue={guestRemarksCheckOut ?? undefined}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function DocumentationFieldset({ voucherNumber }: { voucherNumber?: string | null }) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Documentation</span>
        <CheckInFieldInfo
          label="Documentation"
          text="References printed or stored on the registration packet. Folio and registration numbers are generated on save; voucher is an external prepaid or tour reference."
        />
      </legend>
      <p className="text-xs text-slate-500">
        Folio # and registration # are generated when you save. Voucher # is optional external reference.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="voucherNumber"
            helpTitle="Voucher #"
            helpText="Third-party voucher, tour pack, or prepaid confirmation number. Links the stay to an external payment or package."
          >
            Voucher #
          </CheckInFieldLabelRow>
          <Input id="voucherNumber" name="voucherNumber" defaultValue={voucherNumber ?? undefined} className="h-10 rounded-xl" />
        </div>
      </div>
    </fieldset>
  );
}
