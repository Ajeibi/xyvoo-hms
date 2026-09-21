"use client";

import type { Value as PhoneInputValue } from "react-phone-number-input";
import PhoneInput from "react-phone-number-input";
import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { Input } from "@/components/ui/input";

type PurposeOfVisit = "leisure" | "business" | "transit";
type IdType = "passport" | "national_id" | "drivers_license";

/** Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change). */
export function CheckInPrimaryGuestFieldset({
  guestTitle,
  setGuestTitle,
  purposeOfVisit,
  setPurposeOfVisit,
  firstName,
  lastName,
  phone,
  setPhone,
  primaryEmailInput,
  setPrimaryEmailInput,
  nationality,
  idType,
  setIdType,
  idNumber,
  idExpiryDate,
  dateOfBirth,
}: {
  guestTitle: string;
  setGuestTitle: (v: string) => void;
  purposeOfVisit: PurposeOfVisit;
  setPurposeOfVisit: (v: PurposeOfVisit) => void;
  firstName?: string;
  lastName?: string;
  phone: string | undefined;
  setPhone: (v: PhoneInputValue | undefined) => void;
  primaryEmailInput: string;
  setPrimaryEmailInput: (v: string) => void;
  nationality?: string;
  idType: IdType;
  setIdType: (v: IdType) => void;
  idNumber?: string;
  idExpiryDate?: string;
  dateOfBirth?: string;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Guest 1 — primary</span>
        <CheckInFieldInfo
          label="Primary guest"
          text="Lead guest on the folio and registration. When more than one person is staying, complete each guest’s section below after setting adults, children, and infants."
        />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="title"
            helpTitle="Title"
            helpText="Salutation for registration cards, folio, and formal correspondence (Mr, Mrs, Dr, etc.). Optional."
          >
            Title
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="title"
            value={guestTitle}
            onChange={setGuestTitle}
            allowEmpty
            emptyLabel="—"
            placeholder="Select title…"
            options={[
              { value: "mr", label: "Mr" },
              { value: "mrs", label: "Mrs" },
              { value: "ms", label: "Ms" },
              { value: "dr", label: "Dr" },
              { value: "chief", label: "Chief" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="purposeOfVisit"
            helpTitle="Purpose of visit"
            helpText="Leisure, business, or transit. Used for management reports and can influence how the stay is coded in analytics."
          >
            Purpose of visit
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="purposeOfVisit"
            value={purposeOfVisit}
            onChange={(v) => setPurposeOfVisit(v as PurposeOfVisit)}
            placeholder="Select purpose…"
            options={[
              { value: "leisure", label: "Leisure" },
              { value: "business", label: "Business" },
              { value: "transit", label: "Transit" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="firstName" className="text-sm font-medium text-slate-700">
            First name <span className="text-rose-600">*</span>
          </label>
          <Input id="firstName" name="firstName" required defaultValue={firstName} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <label htmlFor="lastName" className="text-sm font-medium text-slate-700">
            Last name <span className="text-rose-600">*</span>
          </label>
          <Input id="lastName" name="lastName" required defaultValue={lastName} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="phone"
            required
            helpTitle="Phone"
            helpText="Guest phone in international (E.164) format with country code. Used for contact, optional SMS/WhatsApp, and folio notices."
          >
            Phone
          </CheckInFieldLabelRow>
          <PhoneInput
            id="phone"
            international
            defaultCountry="NG"
            value={phone}
            onChange={setPhone}
            placeholder="Phone number"
            className="phone-input-wrapper !rounded-xl"
            style={{ ["--PhoneInputCountryFlag-height" as string]: "1.1em" }}
            aria-required
          />
          <p className="text-xs text-slate-500">E.164 — include country code.</p>
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="email"
            required
            helpTitle="Email"
            helpText="Primary email for confirmations, e-folio, and guest communications. Must be reachable for this stay."
          >
            Email
          </CheckInFieldLabelRow>
          <Input
            id="email"
            name="email"
            type="email"
            required
            value={primaryEmailInput}
            onChange={(e) => setPrimaryEmailInput(e.target.value)}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="nationality"
            helpTitle="Nationality (ISO)"
            helpText="Two-letter ISO country code (e.g. NG). Used for guest statistics, immigration-related flags, and reporting."
          >
            Nationality (ISO)
          </CheckInFieldLabelRow>
          <Input id="nationality" name="nationality" defaultValue={nationality ?? "NG"} maxLength={2} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="idType"
            helpTitle="ID type"
            helpText="Official ID category presented at check-in. National ID has no expiry in this form; passport and driver’s license require an expiry date."
          >
            ID type
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="idType"
            value={idType}
            onChange={(v) => setIdType(v as IdType)}
            placeholder="Select ID type…"
            options={[
              { value: "national_id", label: "National ID" },
              { value: "passport", label: "Passport" },
              { value: "drivers_license", label: "Driver's license" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="idNumber"
            required
            helpTitle="ID number"
            helpText="Number on the guest’s ID document. Used for registration and audit; must match the document shown."
          >
            ID number
          </CheckInFieldLabelRow>
          <Input id="idNumber" name="idNumber" required defaultValue={idNumber} className="h-10 rounded-xl" />
        </div>
        {idType !== "national_id" ? (
          <div className="space-y-2">
            <CheckInFieldLabelRow
              htmlFor="idExpiryDate"
              required
              helpTitle="ID expiry"
              helpText="Expiry date of the ID. The property may refuse check-in if the document is expired per your policy."
            >
              ID expiry
            </CheckInFieldLabelRow>
            <Input
              id="idExpiryDate"
              name="idExpiryDate"
              type="date"
              required
              defaultValue={idExpiryDate || undefined}
              className="h-10 rounded-xl"
            />
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <CheckInFieldLabelRow
            htmlFor="dateOfBirth"
            required
            helpTitle="Date of birth"
            helpText="Guest date of birth for registration, age-restricted rates if any, and compliance. Must match ID where applicable."
          >
            Date of birth
          </CheckInFieldLabelRow>
          <Input id="dateOfBirth" name="dateOfBirth" type="date" required defaultValue={dateOfBirth} className="h-10 rounded-xl" />
        </div>
      </div>
    </fieldset>
  );
}
