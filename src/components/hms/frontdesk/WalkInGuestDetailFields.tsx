"use client";

import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { Input } from "@/components/ui/input";
import type { AccompanyingAdultGuest, MinorGuest } from "@/lib/hms/walk-in-check-in-payload";

export function emptyAccompanyingAdult(): AccompanyingAdultGuest {
  return {
    title: null,
    firstName: "",
    lastName: "",
    phone: null,
    email: null,
    nationality: "NG",
    idType: "national_id",
    idNumber: "",
    idExpiryDate: null,
    dateOfBirth: "",
  };
}

export function emptyMinorGuest(): MinorGuest {
  return {
    firstName: "",
    lastName: "",
    dateOfBirth: "",
    nationality: "NG",
  };
}

export function WalkInAccompanyingAdultCard({
  guestNumber,
  value,
  onChange,
  primaryPhone,
  primaryEmail,
}: {
  guestNumber: number;
  value: AccompanyingAdultGuest;
  onChange: (next: AccompanyingAdultGuest) => void;
  primaryPhone: string;
  primaryEmail: string;
}) {
  const patch = (partial: Partial<AccompanyingAdultGuest>) => onChange({ ...value, ...partial });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-900">
        Guest {guestNumber} <span className="font-normal text-slate-500">(adult)</span>
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow htmlFor={`adult-${guestNumber}-title`} helpTitle="Title" helpText="Optional salutation.">
            Title
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id={`adult-${guestNumber}-title`}
            value={value.title ?? ""}
            onChange={(v) => patch({ title: v ? (v as AccompanyingAdultGuest["title"]) : null })}
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
          <label htmlFor={`adult-${guestNumber}-firstName`} className="text-sm font-medium text-slate-700">
            First name <span className="text-rose-600">*</span>
          </label>
          <Input
            id={`adult-${guestNumber}-firstName`}
            value={value.firstName}
            onChange={(e) => patch({ firstName: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={`adult-${guestNumber}-lastName`} className="text-sm font-medium text-slate-700">
            Last name <span className="text-rose-600">*</span>
          </label>
          <Input
            id={`adult-${guestNumber}-lastName`}
            value={value.lastName}
            onChange={(e) => patch({ lastName: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor={`adult-${guestNumber}-phone`}
            helpTitle="Phone"
            helpText="Optional — uses primary guest phone if blank."
          >
            Phone
          </CheckInFieldLabelRow>
          <PhoneInput
            id={`adult-${guestNumber}-phone`}
            international
            defaultCountry="NG"
            value={value.phone ?? undefined}
            onChange={(v) => patch({ phone: v ?? null })}
            placeholder={primaryPhone || "Phone number"}
            className="phone-input-wrapper !rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor={`adult-${guestNumber}-email`}
            helpTitle="Email"
            helpText="Optional — uses primary guest email if blank."
          >
            Email
          </CheckInFieldLabelRow>
          <Input
            id={`adult-${guestNumber}-email`}
            type="email"
            value={value.email ?? ""}
            onChange={(e) => patch({ email: e.target.value || null })}
            placeholder={primaryEmail || "Email"}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow htmlFor={`adult-${guestNumber}-nationality`} helpTitle="Nationality" helpText="ISO country code.">
            Nationality (ISO)
          </CheckInFieldLabelRow>
          <Input
            id={`adult-${guestNumber}-nationality`}
            value={value.nationality}
            onChange={(e) => patch({ nationality: e.target.value.toUpperCase().slice(0, 2) })}
            maxLength={2}
            required
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow htmlFor={`adult-${guestNumber}-idType`} helpTitle="ID type" helpText="Official ID presented.">
            ID type
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id={`adult-${guestNumber}-idType`}
            value={value.idType}
            onChange={(v) =>
              patch({
                idType: v as AccompanyingAdultGuest["idType"],
                idExpiryDate: v === "national_id" ? null : value.idExpiryDate,
              })
            }
            options={[
              { value: "national_id", label: "National ID" },
              { value: "passport", label: "Passport" },
              { value: "drivers_license", label: "Driver's license" },
            ]}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor={`adult-${guestNumber}-idNumber`} className="text-sm font-medium text-slate-700">
            ID number <span className="text-rose-600">*</span>
          </label>
          <Input
            id={`adult-${guestNumber}-idNumber`}
            value={value.idNumber}
            onChange={(e) => patch({ idNumber: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
        {value.idType !== "national_id" ? (
          <div className="space-y-2">
            <label htmlFor={`adult-${guestNumber}-idExpiry`} className="text-sm font-medium text-slate-700">
              ID expiry <span className="text-rose-600">*</span>
            </label>
            <Input
              id={`adult-${guestNumber}-idExpiry`}
              type="date"
              value={value.idExpiryDate ?? ""}
              onChange={(e) => patch({ idExpiryDate: e.target.value })}
              required
              className="h-10 rounded-xl"
            />
          </div>
        ) : null}
        <div className="space-y-2 sm:col-span-2">
          <label htmlFor={`adult-${guestNumber}-dob`} className="text-sm font-medium text-slate-700">
            Date of birth <span className="text-rose-600">*</span>
          </label>
          <Input
            id={`adult-${guestNumber}-dob`}
            type="date"
            value={value.dateOfBirth}
            onChange={(e) => patch({ dateOfBirth: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}

export function WalkInMinorGuestCard({
  label,
  value,
  onChange,
}: {
  label: string;
  value: MinorGuest;
  onChange: (next: MinorGuest) => void;
}) {
  const patch = (partial: Partial<MinorGuest>) => onChange({ ...value, ...partial });

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <p className="mb-3 text-sm font-semibold text-slate-900">{label}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            First name <span className="text-rose-600">*</span>
          </label>
          <Input
            value={value.firstName}
            onChange={(e) => patch({ firstName: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Last name <span className="text-rose-600">*</span>
          </label>
          <Input
            value={value.lastName}
            onChange={(e) => patch({ lastName: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-700">
            Date of birth <span className="text-rose-600">*</span>
          </label>
          <Input
            type="date"
            value={value.dateOfBirth}
            onChange={(e) => patch({ dateOfBirth: e.target.value })}
            required
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow htmlFor="" helpTitle="Nationality" helpText="ISO country code.">
            Nationality (ISO)
          </CheckInFieldLabelRow>
          <Input
            value={value.nationality ?? "NG"}
            onChange={(e) => patch({ nationality: e.target.value.toUpperCase().slice(0, 2) })}
            maxLength={2}
            className="h-10 rounded-xl"
          />
        </div>
      </div>
    </div>
  );
}

export function validateAccompanyingAdult(
  guest: AccompanyingAdultGuest,
  guestNumber: number,
): string | null {
  if (!guest.firstName.trim() || !guest.lastName.trim()) {
    return `Guest ${guestNumber}: enter first and last name.`;
  }
  if (!guest.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(guest.dateOfBirth)) {
    return `Guest ${guestNumber}: enter date of birth.`;
  }
  if (!guest.idNumber.trim()) {
    return `Guest ${guestNumber}: enter ID number.`;
  }
  if (guest.idType !== "national_id" && !guest.idExpiryDate) {
    return `Guest ${guestNumber}: enter ID expiry.`;
  }
  if (guest.phone?.trim() && !isValidPhoneNumber(guest.phone.trim())) {
    return `Guest ${guestNumber}: enter a valid phone number or leave blank.`;
  }
  if (guest.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) {
    return `Guest ${guestNumber}: enter a valid email or leave blank.`;
  }
  return null;
}

export function validateMinorGuest(guest: MinorGuest, label: string): string | null {
  if (!guest.firstName.trim() || !guest.lastName.trim()) {
    return `${label}: enter first and last name.`;
  }
  if (!guest.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(guest.dateOfBirth)) {
    return `${label}: enter date of birth.`;
  }
  return null;
}
