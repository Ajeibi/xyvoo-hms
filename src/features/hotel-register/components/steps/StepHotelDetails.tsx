"use client";

import PhoneInput from "react-phone-number-input";
import Link from "next/link";
import { HOTEL_TYPES, INPUT_CLASS, MISSING_FIELD_INFO } from "@/features/hotel-register/constants";
import AddressAutocomplete from "@/features/hotel-register/components/AddressAutocomplete";
import CityAutocomplete from "@/features/hotel-register/components/CityAutocomplete";
import CountryDropdown from "@/features/hotel-register/components/CountryDropdown";
import { describedBy, ErrorBanner, Field, LINK_CLASS, PRIMARY_BUTTON_CLASS, Spinner } from "@/features/hotel-register/components/fields";
import { useHotelRegisterStore } from "@/features/hotel-register/store";
import { SubdomainInput } from "@/components/forms/SubdomainInput";
import { cn } from "@/lib/utils";

export default function StepHotelDetails() {
  const hotel = useHotelRegisterStore((s) => s.hotel);
  const error = useHotelRegisterStore((s) => s.error);
  const loading = useHotelRegisterStore((s) => s.loading);
  const missingFields = useHotelRegisterStore((s) => s.missingFields);
  const sendOtp = useHotelRegisterStore((s) => s.sendOtp);
  const setHotelField = useHotelRegisterStore((s) => s.setHotelField);
  const setSubdomain = useHotelRegisterStore((s) => s.setSubdomain);

  // A field flagged by the last Continue stays marked until it has a value.
  const fieldError = (storeLabel: string, filled: boolean) =>
    missingFields.includes(storeLabel) && !filled ? MISSING_FIELD_INFO[storeLabel]?.message : undefined;

  const errors = {
    name: fieldError("Hotel Name", Boolean(hotel.hotel_name.trim())),
    subdomain: fieldError("Hotel Web Address", Boolean(hotel.subdomain.trim())),
    email: fieldError("Hotel Email", Boolean(hotel.contact_email.trim())),
    phone: fieldError("Phone Number", Boolean(hotel.contact_phone)),
    country: fieldError("Country", Boolean(hotel.country)),
    city: fieldError("City", Boolean(hotel.city)),
    address: fieldError("Address", Boolean(hotel.address.trim())),
    rooms: fieldError("Number of Rooms", Boolean(hotel.room_count)),
    type: fieldError("Hotel Type", Boolean(hotel.hotel_type)),
    terms: fieldError("Terms Agreement", hotel.agreed),
  };

  return (
    <div className="space-y-4">
      <ErrorBanner message={error} />

      <Field id="hotel-name" label="Hotel name" error={errors.name}>
        <input
          id="hotel-name"
          autoComplete="organization"
          value={hotel.hotel_name}
          onChange={(e) => setHotelField("hotel_name", e.target.value)}
          className={INPUT_CLASS}
          placeholder="e.g. Grand Palace Hotel"
          aria-invalid={Boolean(errors.name) || undefined}
          aria-describedby={describedBy("hotel-name", { error: errors.name })}
        />
      </Field>

      <Field
        id="hotel-subdomain"
        label="Hotel web address"
        error={errors.subdomain}
        hint={<>Lowercase letters, numbers and hyphens only. This becomes your hotel&rsquo;s web address.</>}
      >
        <SubdomainInput
          id="hotel-subdomain"
          name="subdomain"
          value={hotel.subdomain}
          onChange={(e) => setSubdomain(e.target.value)}
          placeholder="grand-palace"
          hasError={Boolean(errors.subdomain)}
          ringClassName="focus-within:ring-xyvoo-blue"
          aria-invalid={Boolean(errors.subdomain) || undefined}
          aria-describedby={describedBy("hotel-subdomain", { hint: true, error: errors.subdomain })}
        />
      </Field>

      <Field
        id="hotel-email"
        label="Hotel email"
        error={errors.email}
        hint="This becomes your login and appears on guest-facing outputs."
      >
        <input
          id="hotel-email"
          type="email"
          autoComplete="email"
          value={hotel.contact_email}
          onChange={(e) => setHotelField("contact_email", e.target.value)}
          className={INPUT_CLASS}
          placeholder="admin@grandpalace.com"
          aria-invalid={Boolean(errors.email) || undefined}
          aria-describedby={describedBy("hotel-email", { hint: true, error: errors.email })}
        />
      </Field>

      <Field id="hotel-phone" label="Phone number" error={errors.phone}>
        <PhoneInput
          numberInputProps={{
            id: "hotel-phone",
            "aria-invalid": Boolean(errors.phone) || undefined,
            "aria-describedby": describedBy("hotel-phone", { error: errors.phone }),
          }}
          international
          defaultCountry="NG"
          value={hotel.contact_phone}
          onChange={(val) => setHotelField("contact_phone", val || "")}
          placeholder="803 123 4567"
          className={cn(
            "storefront-phone-input",
            errors.phone ? "has-error" : "focus-within:[box-shadow:0_0_0_2px_var(--xyvoo-blue)]!",
          )}
          style={{ ["--PhoneInputCountryFlag-height" as string]: "1.2em" }}
        />
      </Field>

      <Field id="hotel-country" label="Country" error={errors.country}>
        <CountryDropdown
          id="hotel-country"
          value={hotel.country}
          invalid={Boolean(errors.country)}
          describedBy={describedBy("hotel-country", { error: errors.country })}
          onChange={(v) => {
            setHotelField("country", v);
            setHotelField("city", "");
          }}
        />
      </Field>

      <Field id="hotel-city" label="City" error={errors.city}>
        <CityAutocomplete
          id="hotel-city"
          value={hotel.city}
          onChange={(v) => setHotelField("city", v)}
          country={hotel.country}
          invalid={Boolean(errors.city)}
          describedBy={describedBy("hotel-city", { error: errors.city })}
        />
      </Field>

      <Field id="hotel-address" label="Hotel address" error={errors.address}>
        <AddressAutocomplete
          id="hotel-address"
          value={hotel.address}
          onChange={(v) => setHotelField("address", v)}
          country={hotel.country}
          invalid={Boolean(errors.address)}
          describedBy={describedBy("hotel-address", { error: errors.address })}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field id="hotel-room-count" label="Number of rooms" error={errors.rooms}>
          <input
            id="hotel-room-count"
            type="number"
            min="1"
            inputMode="numeric"
            value={hotel.room_count}
            onChange={(e) => setHotelField("room_count", e.target.value)}
            className={INPUT_CLASS}
            placeholder="e.g. 50"
            aria-invalid={Boolean(errors.rooms) || undefined}
            aria-describedby={describedBy("hotel-room-count", { error: errors.rooms })}
          />
        </Field>
        <Field id="hotel-type" label="Hotel type" error={errors.type}>
          <select
            id="hotel-type"
            className={cn(INPUT_CLASS, "cursor-pointer", !hotel.hotel_type && "text-slate-600")}
            value={hotel.hotel_type}
            onChange={(e) => setHotelField("hotel_type", e.target.value)}
            aria-invalid={Boolean(errors.type) || undefined}
            aria-describedby={describedBy("hotel-type", { error: errors.type })}
          >
            <option value="">Select a type</option>
            {HOTEL_TYPES.map((type) => (
              <option key={type} value={type} className="text-black">
                {type}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className={cn("rounded-xl transition-all", errors.terms && "border border-rose-300 bg-rose-50/70 p-3 ring-2 ring-rose-200")}>
        <label className="flex cursor-pointer items-start gap-3 text-sm text-black">
          <input
            id="hotel-terms"
            type="checkbox"
            checked={hotel.agreed}
            onChange={(e) => setHotelField("agreed", e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-xyvoo-blue-deep"
            aria-invalid={Boolean(errors.terms) || undefined}
            aria-describedby={describedBy("hotel-terms", { error: errors.terms })}
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className={LINK_CLASS}>
              terms of service<span className="sr-only"> (opens in a new tab)</span>
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" className={LINK_CLASS}>
              privacy policy<span className="sr-only"> (opens in a new tab)</span>
            </Link>
            .
          </span>
        </label>
        {errors.terms ? (
          <p id="hotel-terms-error" className="mt-1.5 text-sm font-semibold text-rose-700">
            {errors.terms}
          </p>
        ) : null}
      </div>

      <div className="border-t border-slate-200 pt-6">
        <button type="button" onClick={sendOtp} disabled={loading} className={PRIMARY_BUTTON_CLASS}>
          {loading ? (
            <>
              <Spinner />
              <span className="sr-only">Sending your code…</span>
            </>
          ) : (
            "Continue"
          )}
        </button>
      </div>
    </div>
  );
}
