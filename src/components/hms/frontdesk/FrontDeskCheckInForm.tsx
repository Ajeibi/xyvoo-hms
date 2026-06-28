"use client";

import "react-phone-number-input/style.css";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskRoomAssignmentPicker } from "@/components/hms/frontdesk/FrontDeskRoomAssignmentPicker";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import {
  emptyAccompanyingAdult,
  emptyMinorGuest,
  validateAccompanyingAdult,
  validateMinorGuest,
  WalkInAccompanyingAdultCard,
  WalkInMinorGuestCard,
} from "@/components/hms/frontdesk/WalkInGuestDetailFields";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { NIGERIA_VAT_RATE_PERCENT } from "@/lib/hms/nigeria-hospitality-taxes";
import type { HotelPricingSetup, HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { NATIONAL_ID_ID_EXPIRY_PLACEHOLDER, type AccompanyingAdultGuest, type MinorGuest } from "@/lib/hms/walk-in-check-in-payload";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { DiscountScope } from "@/lib/hms/walk-in-pricing";
import {
  canAssignRoomUnit,
  resolveAssignableRoomCode,
  type CheckInRoomUnit,
} from "@/lib/hms/check-in-room-units";
import type { CheckInStaffOption } from "@/lib/hms/check-in-staff-options";
import {
  assertWithinRoomTypeOccupancy,
  calendarNightsBetween,
  computeWalkInRoomPricing,
  nightlyBarBeforeDiscount,
  totalHeadcount,
} from "@/lib/hms/walk-in-pricing";

type FrontDeskCheckInFormProps = {
  slug: string;
  roomTypes: HotelRoomTypeSetup[];
  roomUnits: CheckInRoomUnit[];
  checkInStaffOptions: CheckInStaffOption[];
  /** Logged-in user when they are a tenant member; used as default for "checked in by". */
  defaultCheckedInByUserId: string | null;
  defaultRoomCode?: string;
  pricing: HotelPricingSetup;
  /** Hotel checkout time default for the departure time field. */
  defaultDepartureTime: string;
};

const SETTLEMENT_OPTIONS = [
  {
    value: "cash" as const,
    label: "Cash",
    help: "Guest settles mainly in cash. Folio balance is typically collected at checkout unless you take deposit upfront.",
  },
  {
    value: "card" as const,
    label: "Credit card",
    help: "Card payments are collected via Paystack on the guest folio — charge at check-in, during the stay, or at checkout.",
  },
  {
    value: "pos" as const,
    label: "POS (terminal)",
    help: "Guest pays on your bank POS terminal at the desk. Record the payment on the folio after the receipt is in hand — same workflow as cash.",
  },
  {
    value: "partial_credit" as const,
    label: "Partial credit",
    help: "Part of the balance on card or account credit and the remainder by another method (e.g. cash + card).",
  },
  {
    value: "split" as const,
    label: "Split tender",
    help: "Multiple payment methods or legs on one folio (e.g. guest pays room, company pays incidentals per your split rules).",
  },
  {
    value: "direct_bill" as const,
    label: "Direct bill / company",
    help: "Charges post to a company master account or AR ledger; guest may still have incidentals on guest leg.",
  },
];

const DISCOUNT_SCOPES: { value: DiscountScope; label: string }[] = [
  { value: "none", label: "No discount" },
  { value: "all_nights", label: "All nights" },
  { value: "first_night", label: "First night only" },
  { value: "last_night", label: "Last night only" },
  { value: "first_and_last", label: "First and last night" },
];

/** `YYYY-MM-DD` in the user's local calendar (not UTC). */
function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** `HH:mm` in 24h local time for `<input type="time" />`. */
function localHHmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function FrontDeskCheckInForm({
  slug,
  roomTypes,
  roomUnits,
  checkInStaffOptions,
  defaultCheckedInByUserId,
  defaultRoomCode,
  pricing,
  defaultDepartureTime,
}: FrontDeskCheckInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [assignedRoom, setAssignedRoom] = useState(() =>
    resolveAssignableRoomCode(searchParams.get("room") ?? defaultRoomCode, roomUnits),
  );

  const defaultType = roomTypes[0]?.id ?? "";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | undefined>(undefined);
  const [primaryEmailInput, setPrimaryEmailInput] = useState("");
  const [roomTypeCode, setRoomTypeCode] = useState(defaultType);
  const [arrivalDate, setArrivalDate] = useState(() => localYmd(new Date()));
  const [departureDate, setDepartureDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localYmd(d);
  });
  const [arrivalTime, setArrivalTime] = useState(() => localHHmm(new Date()));
  const [departureTime, setDepartureTime] = useState(defaultDepartureTime);
  /** String state so users can clear the field and type a new number (controlled number + `|| 1` forced "12" / blocked empty). */
  const [adultsInput, setAdultsInput] = useState("1");
  const [childrenInput, setChildrenInput] = useState("0");
  const [infantsInput, setInfantsInput] = useState("0");
  const [discountPercentInput, setDiscountPercentInput] = useState("");
  const discountPercent = useMemo(() => {
    const t = discountPercentInput.trim().replace(",", ".");
    if (t === "" || t === ".") return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }, [discountPercentInput]);
  const [discountScope, setDiscountScope] = useState<DiscountScope>("none");
  const [taxExemptVat, setTaxExemptVat] = useState(false);
  const [taxExemptService, setTaxExemptService] = useState(false);
  const [taxExemptState, setTaxExemptState] = useState(false);
  const [taxExemptStamp, setTaxExemptStamp] = useState(false);
  const [settlementMethod, setSettlementMethod] = useState<
    "cash" | "card" | "pos" | "split" | "direct_bill" | "partial_credit"
  >("cash");
  const [guestTitle, setGuestTitle] = useState("");
  const [purposeOfVisit, setPurposeOfVisit] = useState<"leisure" | "business" | "transit">("leisure");
  const [idTypeField, setIdTypeField] = useState<"passport" | "national_id" | "drivers_license">("national_id");
  const [rateTypeField, setRateTypeField] = useState<"rack" | "corporate" | "walk_in_bar" | "promotional">(
    "walk_in_bar",
  );
  const [marketSegmentField, setMarketSegmentField] = useState<
    "transient" | "corporate" | "group" | "government" | "wholesale"
  >("transient");
  const [sourceField, setSourceField] = useState<
    "walk_in" | "phone" | "referral" | "ota" | "website" | "travel_agent"
  >("walk_in");
  const [additionalAdults, setAdditionalAdults] = useState<AccompanyingAdultGuest[]>([]);
  const [childGuests, setChildGuests] = useState<MinorGuest[]>([]);
  const [infantGuests, setInfantGuests] = useState<MinorGuest[]>([]);

  const selectedType = useMemo(() => roomTypes.find((t) => t.id === roomTypeCode), [roomTypes, roomTypeCode]);

  const assignedUnit = useMemo(() => {
    const code = assignedRoom.trim();
    if (!code) return undefined;
    return roomUnits.find((u) => u.roomCode === code);
  }, [assignedRoom, roomUnits]);

  const effectiveOccupancyRoomType = useMemo(() => {
    if (!selectedType) return undefined;
    const rtc = assignedUnit?.roomTypeCode?.trim();
    if (!assignedRoom.trim() || !rtc) return selectedType;
    const inv = roomTypes.find((t) => t.id === rtc);
    return inv ?? selectedType;
  }, [selectedType, assignedRoom, assignedUnit, roomTypes]);

  const maxGuestsPerField = effectiveOccupancyRoomType?.maxOccupancy ?? selectedType?.maxOccupancy ?? 20;

  const adults = useMemo(() => {
    const t = adultsInput.trim();
    if (t === "") return 1;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(maxGuestsPerField, Math.max(1, n));
  }, [adultsInput, maxGuestsPerField]);

  const children = useMemo(() => {
    const t = childrenInput.trim();
    if (t === "") return 0;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(20, n));
  }, [childrenInput]);

  const infants = useMemo(() => {
    const t = infantsInput.trim();
    if (t === "") return 0;
    const n = Number.parseInt(t, 10);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(20, n));
  }, [infantsInput]);

  useEffect(() => {
    const needed = Math.max(0, adults - 1);
    setAdditionalAdults((prev) => {
      if (prev.length === needed) return prev;
      if (prev.length < needed) {
        return [
          ...prev,
          ...Array.from({ length: needed - prev.length }, () => emptyAccompanyingAdult()),
        ];
      }
      return prev.slice(0, needed);
    });
  }, [adults]);

  useEffect(() => {
    setChildGuests((prev) => {
      if (prev.length === children) return prev;
      if (prev.length < children) {
        return [...prev, ...Array.from({ length: children - prev.length }, () => emptyMinorGuest())];
      }
      return prev.slice(0, children);
    });
  }, [children]);

  useEffect(() => {
    setInfantGuests((prev) => {
      if (prev.length === infants) return prev;
      if (prev.length < infants) {
        return [...prev, ...Array.from({ length: infants - prev.length }, () => emptyMinorGuest())];
      }
      return prev.slice(0, infants);
    });
  }, [infants]);

  const defaultCheckedInBySelect = useMemo(() => {
    if (defaultCheckedInByUserId && checkInStaffOptions.some((o) => o.userId === defaultCheckedInByUserId)) {
      return defaultCheckedInByUserId;
    }
    if (checkInStaffOptions.length === 1) return checkInStaffOptions[0]!.userId;
    return "";
  }, [checkInStaffOptions, defaultCheckedInByUserId]);

  const [checkedInByUserIdField, setCheckedInByUserIdField] = useState(defaultCheckedInBySelect);
  useEffect(() => {
    setCheckedInByUserIdField(defaultCheckedInBySelect);
  }, [defaultCheckedInBySelect]);

  useEffect(() => {
    if (roomTypes.length > 0 && !roomTypes.some((t) => t.id === roomTypeCode)) {
      setRoomTypeCode(roomTypes[0]!.id);
    }
  }, [roomTypeCode, roomTypes]);

  useEffect(() => {
    const fromUrl = (searchParams.get("room") ?? defaultRoomCode ?? "").trim();
    if (fromUrl) {
      setAssignedRoom(resolveAssignableRoomCode(fromUrl, roomUnits));
      return;
    }
    setAssignedRoom((prev) => {
      if (!prev) return "";
      const u = roomUnits.find((r) => r.roomCode === prev);
      if (!u || !canAssignRoomUnit(u.status)) return "";
      return prev;
    });
  }, [searchParams, defaultRoomCode, roomUnits]);

  /** Keep product room type aligned with an assigned physical key (server always uses inventory type for that room). */
  useEffect(() => {
    const code = assignedRoom.trim();
    if (!code) return;
    const u = roomUnits.find((r) => r.roomCode === code);
    const rtc = u?.roomTypeCode?.trim();
    if (!rtc || rtc === roomTypeCode) return;
    setRoomTypeCode(rtc);
  }, [assignedRoom, roomUnits, roomTypeCode]);

  /** Clear assignment when room type changes and the selected key is a different category. */
  useEffect(() => {
    const code = assignedRoom.trim();
    if (!code || !roomTypeCode) return;
    const u = roomUnits.find((r) => r.roomCode === code);
    if (u?.roomTypeCode && u.roomTypeCode !== roomTypeCode) {
      setAssignedRoom("");
    }
  }, [roomTypeCode, assignedRoom, roomUnits]);

  const nights = useMemo(
    () => calendarNightsBetween(arrivalDate, departureDate),
    [arrivalDate, departureDate],
  );

  const nightlyBar = useMemo(() => {
    if (!selectedType) return 0;
    return nightlyBarBeforeDiscount(selectedType, pricing, adults, children, infants);
  }, [selectedType, pricing, adults, children, infants]);

  const occupancyCheck = useMemo(() => {
    if (!effectiveOccupancyRoomType) {
      return { ok: false as const, message: "Configure at least one room type in hotel settings." };
    }
    return assertWithinRoomTypeOccupancy(effectiveOccupancyRoomType, adults, children, infants);
  }, [effectiveOccupancyRoomType, adults, children, infants]);

  const roomTypePickerOptions = useMemo(() => {
    if (roomTypes.length === 0) {
      return [{ value: "", label: "Configure room types in hotel settings", disabled: true as const }];
    }
    return roomTypes.map((t) => ({
      value: t.id,
      label: t.name,
      description: `Max ${t.maxOccupancy} guest(s) · BAR ${formatPricingAmount(t.baseRate, pricing.currency)}/night`,
    }));
  }, [roomTypes, pricing.currency]);

  const discountScopePickerOptions = useMemo(
    () => DISCOUNT_SCOPES.map((o) => ({ value: o.value, label: o.label })),
    [],
  );

  const pricingPreview = useMemo(() => {
    if (!selectedType || !occupancyCheck.ok) return null;
    return computeWalkInRoomPricing({
      roomType: selectedType,
      pricing,
      adults,
      children,
      infants,
      nights,
      discountPercent,
      discountScope,
      taxExemptions: {
        exemptVat: taxExemptVat,
        exemptServiceCharge: taxExemptService,
        exemptStateLevy: taxExemptState,
        exemptStampLevy: taxExemptStamp,
      },
    });
  }, [
    selectedType,
    pricing,
    adults,
    children,
    infants,
    nights,
    discountPercent,
    discountScope,
    taxExemptVat,
    taxExemptService,
    taxExemptState,
    taxExemptStamp,
    occupancyCheck,
  ]);

  const headcount = totalHeadcount(adults, children, infants);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setAdultsInput(String(adults));
    setChildrenInput(String(children));
    setInfantsInput(String(infants));

    const phoneE164 = phone?.trim() ?? "";
    if (!phoneE164 || !isValidPhoneNumber(phoneE164)) {
      setError("Enter a valid phone number, including country code.");
      return;
    }

    if (!occupancyCheck.ok) {
      setError(occupancyCheck.message);
      return;
    }

    if (!selectedType) {
      setError("Select a valid room type.");
      return;
    }

    const form = new FormData(event.currentTarget);

    const checkedInByUserId = checkedInByUserIdField.trim();
    if (!checkedInByUserId || !checkInStaffOptions.some((o) => o.userId === checkedInByUserId)) {
      setError("Select the staff member who checked this guest in.");
      return;
    }

    const titleRaw = guestTitle.trim();
    const title =
      titleRaw === "mr" ||
      titleRaw === "mrs" ||
      titleRaw === "ms" ||
      titleRaw === "dr" ||
      titleRaw === "chief" ||
      titleRaw === "other"
        ? titleRaw
        : null;

    const idExpiryDate =
      idTypeField === "national_id"
        ? NATIONAL_ID_ID_EXPIRY_PLACEHOLDER
        : String(form.get("idExpiryDate") ?? "").trim();

    if (idTypeField !== "national_id" && !/^\d{4}-\d{2}-\d{2}$/.test(idExpiryDate)) {
      setError("Enter the ID expiry date.");
      return;
    }

    const primaryEmail = String(form.get("email") ?? "").trim();
    for (let i = 0; i < additionalAdults.length; i += 1) {
      const msg = validateAccompanyingAdult(additionalAdults[i], i + 2);
      if (msg) {
        setError(msg);
        return;
      }
    }
    for (let i = 0; i < childGuests.length; i += 1) {
      const msg = validateMinorGuest(childGuests[i], `Child ${i + 1}`);
      if (msg) {
        setError(msg);
        return;
      }
    }
    for (let i = 0; i < infantGuests.length; i += 1) {
      const msg = validateMinorGuest(infantGuests[i], `Infant ${i + 1}`);
      if (msg) {
        setError(msg);
        return;
      }
    }

    const payload = {
      slug,
      checkedInByUserId,
      title,
      firstName: String(form.get("firstName") ?? "").trim(),
      lastName: String(form.get("lastName") ?? "").trim(),
      phone: phoneE164,
      email: String(form.get("email") ?? "").trim(),
      nationality: String(form.get("nationality") ?? "NG").trim().toUpperCase().slice(0, 2),
      idType: idTypeField,
      idNumber: String(form.get("idNumber") ?? "").trim(),
      idExpiryDate,
      dateOfBirth: String(form.get("dateOfBirth") ?? ""),
      arrivalDate,
      arrivalTime,
      departureDate,
      departureTime,
      adults,
      children,
      infants,
      additionalAdults,
      childGuests,
      infantGuests,
      purposeOfVisit,
      roomTypeCode,
      roomCode: String(form.get("roomCode") ?? "").trim() || undefined,
      ratePerNightBar: nightlyBar,
      discountPercent,
      discountScope,
      taxExemptVat,
      taxExemptServiceCharge: taxExemptService,
      taxExemptStateLevy: taxExemptState,
      taxExemptStampLevy: taxExemptStamp,
      taxExemptionReason: String(form.get("taxExemptionReason") ?? "").trim() || null,
      taxExemptionDocRef: String(form.get("taxExemptionDocRef") ?? "").trim() || null,
      settlementMethod,
      settlementType: String(form.get("settlementType") ?? "").trim() || null,
      cardLast4: String(form.get("cardLast4") ?? "").trim() || null,
      cardExpiry: String(form.get("cardExpiry") ?? "").trim() || null,
      billToAccount: String(form.get("billToAccount") ?? "").trim() || null,
      poNumber: String(form.get("poNumber") ?? "").trim() || null,
      preauthAmount: (() => {
        const v = String(form.get("preauthAmount") ?? "").trim();
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      guestRemarksReservation: String(form.get("guestRemarksReservation") ?? "").trim() || null,
      guestRemarksCheckIn: String(form.get("guestRemarksCheckIn") ?? "").trim() || null,
      guestRemarksCheckOut: String(form.get("guestRemarksCheckOut") ?? "").trim() || null,
      guaranteeReleaseDate: (() => {
        const v = String(form.get("guaranteeReleaseDate") ?? "").trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
      })(),
      minPaymentPerDayToExtend: (() => {
        const v = String(form.get("minPaymentPerDayToExtend") ?? "").trim();
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      seasonCode: String(form.get("seasonCode") ?? "").trim() || null,
      rateType: rateTypeField,
      marketSegment: marketSegmentField,
      source: sourceField,
      bookingChannel: String(form.get("bookingChannel") ?? "").trim() || null,
      travelAgentName: String(form.get("travelAgentName") ?? "").trim() || null,
      commissionPlan: String(form.get("commissionPlan") ?? "").trim() || null,
      commissionValue: (() => {
        const v = String(form.get("commissionValue") ?? "").trim();
        if (!v) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      })(),
      voucherNumber: String(form.get("voucherNumber") ?? "").trim() || null,
      showRateOnRegistrationCard: form.get("showRateOnRegistrationCard") === "on",
      generateBill: form.get("generateBill") === "on",
      rateOverridden: form.get("rateOverridden") === "on",
      rateOverrideReason: String(form.get("rateOverrideReason") ?? "").trim() || null,
      immigrationRegistrationRequired: form.get("immigrationRegistrationRequired") === "on",
      vipFlag: form.get("vipFlag") === "on",
    };

    setLoading(true);
    try {
      const res = await fetch("/api/hotel/frontdesk/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as {
        error?: string;
        confirmationCode?: string;
        folioNumber?: string;
        registrationNumber?: string;
      };
      if (!res.ok) {
        const msg = data.error ?? "Check-in failed.";
        setError(msg);
        toastError("Check-in failed", msg);
        return;
      }
      toastSuccess("Guest checked in", data.confirmationCode ? `Ref ${data.confirmationCode}` : undefined);
      router.push(`/hms/${slug}/frontdesk?checkedIn=${encodeURIComponent(data.confirmationCode ?? "1")}`);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      toastError("Check-in failed", "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const showPreauthField =
    settlementMethod === "card" || settlementMethod === "partial_credit";

  const fieldClass =
    "min-h-[88px] w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/25";

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</p>
      ) : null}

      <div className="lg:grid lg:grid-cols-[1fr_min(100%,380px)] lg:items-start lg:gap-10">
        <div className="space-y-8">
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
                  onChange={(v) => setPurposeOfVisit(v as "leisure" | "business" | "transit")}
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
                <Input id="firstName" name="firstName" required className="h-10 rounded-xl" />
              </div>
              <div className="space-y-2">
                <label htmlFor="lastName" className="text-sm font-medium text-slate-700">
                  Last name <span className="text-rose-600">*</span>
                </label>
                <Input id="lastName" name="lastName" required className="h-10 rounded-xl" />
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
                <Input id="nationality" name="nationality" defaultValue="NG" maxLength={2} className="h-10 rounded-xl" />
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
                  value={idTypeField}
                  onChange={(v) => setIdTypeField(v as "passport" | "national_id" | "drivers_license")}
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
                <Input id="idNumber" name="idNumber" required className="h-10 rounded-xl" />
              </div>
              {idTypeField !== "national_id" ? (
                <div className="space-y-2">
                  <CheckInFieldLabelRow
                    htmlFor="idExpiryDate"
                    required
                    helpTitle="ID expiry"
                    helpText="Expiry date of the ID. The property may refuse check-in if the document is expired per your policy."
                  >
                    ID expiry
                  </CheckInFieldLabelRow>
                  <Input id="idExpiryDate" name="idExpiryDate" type="date" required className="h-10 rounded-xl" />
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
                <Input id="dateOfBirth" name="dateOfBirth" type="date" required className="h-10 rounded-xl" />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
              <span>Stay information</span>
              <CheckInFieldInfo
                label="Stay information"
                text="Dates, times, occupancy, and room product for this reservation. Drives nights, rates, and room assignment rules."
              />
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="arrivalDate"
                  required
                  helpTitle="Arrival date"
                  helpText="Defaults to today’s date in your browser’s local calendar when you open this form. Must be before departure."
                >
                  Arrival date
                </CheckInFieldLabelRow>
                <Input
                  id="arrivalDate"
                  type="date"
                  required
                  value={arrivalDate}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="arrivalTime"
                  required
                  helpTitle="Arrival time"
                  helpText="Defaults to the current local time when you open this form; change it if the guest arrived earlier or later."
                >
                  Arrival time
                </CheckInFieldLabelRow>
                <Input
                  id="arrivalTime"
                  type="time"
                  required
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="departureDate"
                  required
                  helpTitle="Departure date"
                  helpText="Calendar date the stay ends (checkout date). With arrival date, defines how many nights are billed."
                >
                  Departure date
                </CheckInFieldLabelRow>
                <Input
                  id="departureDate"
                  type="date"
                  required
                  value={departureDate}
                  onChange={(e) => setDepartureDate(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="departureTime"
                  required
                  helpTitle="Departure time"
                  helpText="Planned checkout time on the departure date. Often aligns with hotel checkout policy (e.g. 12:00)."
                >
                  Departure time
                </CheckInFieldLabelRow>
                <Input
                  id="departureTime"
                  type="time"
                  required
                  value={departureTime}
                  onChange={(e) => setDepartureTime(e.target.value)}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 sm:col-span-2">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <p className="text-sm font-medium text-slate-800">
                    Nights: <span className="tabular-nums text-blue-700">{nights}</span>
                  </p>
                  <CheckInFieldInfo
                    label="Nights"
                    text="Number of hotel nights between arrival and departure dates (inclusive counting by calendar nights). Used for room charges and the rate summary."
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  From calendar dates (hotel night count). Times are stored on the reservation for arrival /
                  departure.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <CheckInFieldLabelRow
                  htmlFor="roomTypeCode"
                  required
                  helpTitle="Room type"
                  helpText="Product category for pricing and BAR. Max guests for the counts below follow this type until you assign a physical room — then limits follow that key’s inventory type (see assign room)."
                >
                  Room type
                </CheckInFieldLabelRow>
                <FrontDeskPopoverSelect
                  id="roomTypeCode"
                  value={roomTypeCode}
                  onChange={setRoomTypeCode}
                  disabled={roomTypes.length === 0}
                  placeholder="Select room type…"
                  emptyStateMessage="Configure room types in hotel settings."
                  options={roomTypePickerOptions}
                />
                {selectedType ? (
                  <p className="text-xs text-slate-500">
                    Max guests (adults + children + infants):{" "}
                    <strong>{effectiveOccupancyRoomType?.maxOccupancy ?? selectedType.maxOccupancy}</strong>. Current
                    headcount: <strong>{headcount}</strong>.
                  </p>
                ) : null}
                {!occupancyCheck.ok ? (
                  <p className="text-xs font-medium text-rose-600">{occupancyCheck.message}</p>
                ) : null}
              </div>
              <div className="space-y-2 sm:col-span-2">
                <CheckInFieldLabelRow
                  htmlFor="roomCode"
                  helpTitle="Assign room (optional)"
                  helpText="Physical room key from inventory. If set, status becomes occupied and pricing follows this room’s configured type. Leave blank to assign later."
                >
                  Assign room (optional)
                </CheckInFieldLabelRow>
                <FrontDeskRoomAssignmentPicker
                  id="roomCode"
                  name="roomCode"
                  rooms={roomUnits}
                  roomTypeCode={roomTypeCode}
                  roomTypeName={selectedType?.name}
                  value={assignedRoom}
                  onChange={setAssignedRoom}
                />
                <p className="text-xs text-slate-500">
                  Only vacant keys for <strong>{selectedType?.name ?? "the selected room type"}</strong> are listed.
                </p>
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="adults"
                  helpTitle="Adults"
                  helpText="Number of guests aged as adults for occupancy limits and extra-person pricing. At least one adult is required."
                >
                  Adults
                </CheckInFieldLabelRow>
                <Input
                  id="adults"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Adults"
                  value={adultsInput}
                  onChange={(e) => setAdultsInput(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => setAdultsInput(String(adults))}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="children"
                  helpTitle="Children"
                  helpText="Number of child guests. Counts toward room max occupancy; may add extra-child charges from hotel pricing settings."
                >
                  Children
                </CheckInFieldLabelRow>
                <Input
                  id="children"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Children"
                  value={childrenInput}
                  onChange={(e) => setChildrenInput(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => setChildrenInput(String(children))}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="infants"
                  helpTitle="Infants"
                  helpText="Babies or infants not using a bed, still counted in max occupancy for fire and safety limits. Usually no extra-child charge unless your policy says otherwise."
                >
                  Infants
                </CheckInFieldLabelRow>
                <Input
                  id="infants"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Infants"
                  value={infantsInput}
                  onChange={(e) => setInfantsInput(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => setInfantsInput(String(infants))}
                  className="h-10 rounded-xl"
                />
              </div>
            </div>
          </fieldset>

          {additionalAdults.length > 0 || childGuests.length > 0 || infantGuests.length > 0 ? (
            <fieldset className="space-y-4">
              <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                <span>Additional guests</span>
                <CheckInFieldInfo
                  label="Additional guests"
                  text="Identity for every other person on the stay. Adults need full ID details; children and infants need name and date of birth."
                />
              </legend>
              <div className="space-y-4">
                {additionalAdults.map((g, i) => (
                  <WalkInAccompanyingAdultCard
                    key={`adult-${i}`}
                    guestNumber={i + 2}
                    value={g}
                    onChange={(next) =>
                      setAdditionalAdults((prev) => prev.map((row, j) => (j === i ? next : row)))
                    }
                    primaryPhone={phone?.trim() ?? ""}
                    primaryEmail={primaryEmailInput}
                  />
                ))}
                {childGuests.map((g, i) => (
                  <WalkInMinorGuestCard
                    key={`child-${i}`}
                    label={`Child ${i + 1}`}
                    value={g}
                    onChange={(next) =>
                      setChildGuests((prev) => prev.map((row, j) => (j === i ? next : row)))
                    }
                  />
                ))}
                {infantGuests.map((g, i) => (
                  <WalkInMinorGuestCard
                    key={`infant-${i}`}
                    label={`Infant ${i + 1}`}
                    value={g}
                    onChange={(next) =>
                      setInfantGuests((prev) => prev.map((row, j) => (j === i ? next : row)))
                    }
                  />
                ))}
              </div>
            </fieldset>
          ) : null}

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
                <Input id="seasonCode" name="seasonCode" placeholder="e.g. PEAK2026 or N/A" className="h-10 rounded-xl" />
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
                  value={rateTypeField}
                  onChange={(v) => setRateTypeField(v as "rack" | "corporate" | "walk_in_bar" | "promotional")}
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

          <fieldset className="space-y-4">
            <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
              <span>Discount</span>
              <CheckInFieldInfo
                label="Discount"
                text="Percentage off the nightly room BAR before taxes. Scope controls which nights receive the discount (all, first, last, or first and last night)."
              />
            </legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="discountPercent"
                  helpTitle="Discount (%)"
                  helpText="Promotional or negotiated percentage reduction on qualifying room nights (see Apply discount to). Applied before service charge and taxes in the estimate."
                >
                  Discount (%)
                </CheckInFieldLabelRow>
                <Input
                  id="discountPercent"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0"
                  value={discountPercentInput}
                  onChange={(e) => {
                    let next = e.target.value.replace(",", ".");
                    if (next === "") {
                      setDiscountPercentInput("");
                      return;
                    }
                    if (!/^\d{0,3}(\.\d{0,2})?$/.test(next)) return;
                    if (/^0+[1-9]/.test(next)) {
                      next = next.replace(/^0+/, "");
                    }
                    setDiscountPercentInput(next);
                  }}
                  onBlur={() => {
                    setDiscountPercentInput((prev) => {
                      const t = prev.trim().replace(",", ".");
                      if (t === "" || t === ".") return "";
                      const n = Math.min(100, Math.max(0, Number.parseFloat(t.endsWith(".") ? t.slice(0, -1) : t) || 0));
                      if (Number.isInteger(n)) return String(n);
                      return String(n);
                    });
                  }}
                  className="h-10 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="discountScope"
                  helpTitle="Apply discount to"
                  helpText="Which nights get the percentage: none, every night, only the first night, only the last night, or both first and last. Updates the rate summary immediately."
                >
                  Apply discount to
                </CheckInFieldLabelRow>
                <FrontDeskPopoverSelect
                  id="discountScope"
                  value={discountScope}
                  onChange={(v) => setDiscountScope(v as DiscountScope)}
                  placeholder="Select discount scope…"
                  options={discountScopePickerOptions}
                />
              </div>
            </div>
          </fieldset>

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
                <Input id="taxExemptionDocRef" name="taxExemptionDocRef" className="h-10 rounded-xl" />
              </div>
            </div>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
              <span>Settlement &amp; billing</span>
              <CheckInFieldInfo
                label="Settlement & billing"
                text="How the guest or company will pay or guarantee the folio. Pick one primary method; optional fields below capture card hints, pre-auth, and bill-to details."
              />
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {SETTLEMENT_OPTIONS.map((opt) => (
                <div
                  key={opt.value}
                  className={`flex items-center justify-between gap-1 rounded-xl border px-2 py-1.5 text-sm sm:px-3 sm:py-2 ${
                    settlementMethod === opt.value
                      ? "border-blue-400 bg-blue-50/80 text-blue-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-0.5">
                    <input
                      type="radio"
                      name="settlementMethodUi"
                      className="border-slate-300"
                      checked={settlementMethod === opt.value}
                      onChange={() => setSettlementMethod(opt.value)}
                    />
                    {opt.label}
                  </label>
                  <CheckInFieldInfo label={opt.label} text={opt.help} />
                </div>
              ))}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="settlementType"
                  helpTitle="Settlement type / ledger note"
                  helpText="Free-text note for finance (e.g. corporate master, travel agent ledger, city ledger). Clarifies how charges should be routed in back office."
                >
                  Settlement type / ledger note
                </CheckInFieldLabelRow>
                <Input
                  id="settlementType"
                  name="settlementType"
                  placeholder="e.g. Guest account, corporate master…"
                  className="h-10 rounded-xl"
                />
              </div>
              {showPreauthField ? (
                <div className="space-y-2">
                  <CheckInFieldLabelRow
                    htmlFor="preauthAmount"
                    helpTitle="Deposit / authorization amount"
                    helpText="Optional hold amount for card stays. Authorize via Paystack on the folio after check-in, or charge the full balance when ready."
                  >
                    Deposit / auth amount ({pricing.currency})
                  </CheckInFieldLabelRow>
                  <Input
                    id="preauthAmount"
                    name="preauthAmount"
                    type="number"
                    min={0}
                    step="0.01"
                    className="h-10 rounded-xl"
                    placeholder="Optional"
                  />
                </div>
              ) : null}
              {settlementMethod === "partial_credit" ? (
                <>
                  <div className="space-y-2">
                    <CheckInFieldLabelRow
                      htmlFor="cardLast4"
                      helpTitle="Card last 4 digits"
                      helpText="Last four digits only — for staff reference on the folio. Never store full PAN in plain text; use your PCI-compliant capture flow for full numbers."
                    >
                      Card last 4 digits
                    </CheckInFieldLabelRow>
                    <Input id="cardLast4" name="cardLast4" maxLength={4} className="h-10 rounded-xl" />
                  </div>
                  <div className="space-y-2">
                    <CheckInFieldLabelRow
                      htmlFor="cardExpiry"
                      helpTitle="Card expiry (MM/YY)"
                      helpText="Expiry as shown on the card. Helps match receipts and chargebacks; still not full card data."
                    >
                      Card expiry (MM/YY)
                    </CheckInFieldLabelRow>
                    <Input id="cardExpiry" name="cardExpiry" placeholder="MM/YY" className="h-10 rounded-xl" />
                  </div>
                </>
              ) : null}
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="billToAccount"
                  helpTitle="Bill to (account / company)"
                  helpText="Company or master account name or code when a third party pays all or part of the folio (direct bill settlement)."
                >
                  Bill to (account / company)
                </CheckInFieldLabelRow>
                <Input id="billToAccount" name="billToAccount" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="poNumber"
                  helpTitle="PO number"
                  helpText="Purchase order or cost-centre reference from the guest or company so AR can match the invoice."
                >
                  PO number
                </CheckInFieldLabelRow>
                <Input id="poNumber" name="poNumber" className="h-10 rounded-xl" />
              </div>
            </div>
          </fieldset>

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
                <Input id="guaranteeReleaseDate" name="guaranteeReleaseDate" type="date" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="minPaymentPerDayToExtend"
                  helpTitle="Min. payment / day to extend"
                  helpText="Minimum amount the guest must pay per day (or per extension) before front desk may add nights—reduces credit risk."
                >
                  Min. payment / day to extend ({pricing.currency})
                </CheckInFieldLabelRow>
                <Input
                  id="minPaymentPerDayToExtend"
                  name="minPaymentPerDayToExtend"
                  type="number"
                  min={0}
                  step="0.01"
                  className="h-10 rounded-xl"
                  placeholder="0"
                />
              </div>
            </div>
          </fieldset>

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
                />
              </div>
            </div>
          </fieldset>

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
                  value={marketSegmentField}
                  onChange={(v) =>
                    setMarketSegmentField(v as "transient" | "corporate" | "group" | "government" | "wholesale")
                  }
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
                  value={sourceField}
                  onChange={(v) =>
                    setSourceField(v as "walk_in" | "phone" | "referral" | "ota" | "website" | "travel_agent")
                  }
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
                <Input id="bookingChannel" name="bookingChannel" placeholder="e.g. Booking.com" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="travelAgentName"
                  helpTitle="Travel agent name"
                  helpText="Agency or consultant credited with the booking when source is travel agent; supports commission tracking."
                >
                  Travel agent name
                </CheckInFieldLabelRow>
                <Input id="travelAgentName" name="travelAgentName" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="commissionPlan"
                  helpTitle="Commission plan"
                  helpText="Internal name of the commission arrangement (e.g. net 15%, flat fee). Links to finance for OTA or agent payouts."
                >
                  Commission plan
                </CheckInFieldLabelRow>
                <Input id="commissionPlan" name="commissionPlan" className="h-10 rounded-xl" />
              </div>
              <div className="space-y-2">
                <CheckInFieldLabelRow
                  htmlFor="commissionValue"
                  helpTitle="Commission value"
                  helpText="Monetary commission for this stay in your property currency (amount or calculated payout reference per your policy)."
                >
                  Commission value ({pricing.currency})
                </CheckInFieldLabelRow>
                <Input id="commissionValue" name="commissionValue" type="number" min={0} step="0.01" className="h-10 rounded-xl" />
              </div>
            </div>
          </fieldset>

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
                <Input id="voucherNumber" name="voucherNumber" className="h-10 rounded-xl" />
              </div>
            </div>
          </fieldset>

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
                defaultChecked
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
              <input id="generateBill" type="checkbox" name="generateBill" defaultChecked className="mt-1 rounded border-slate-300" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
                <label htmlFor="generateBill">Generate bill number</label>
                <CheckInFieldInfo
                  label="Generate bill number"
                  text="When checked, the system assigns a folio/bill sequence for this stay so charges can post to a numbered guest bill."
                />
              </div>
            </div>
            <div className="flex items-start gap-2">
              <input id="rateOverridden" type="checkbox" name="rateOverridden" className="mt-1 rounded border-slate-300" />
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
              <Input id="rateOverrideReason" name="rateOverrideReason" className="h-10 rounded-xl" />
            </div>
            <div className="flex items-start gap-2">
              <input
                id="immigrationRegistrationRequired"
                type="checkbox"
                name="immigrationRegistrationRequired"
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
              <input type="checkbox" id="vipFlag" name="vipFlag" className="mt-1 rounded border-slate-300" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-sm text-slate-700">
                <label htmlFor="vipFlag">VIP guest</label>
                <CheckInFieldInfo
                  label="VIP guest"
                  text="High-touch or high-value guest; may drive welcome amenities, alerts to management, and priority on requests."
                />
              </div>
            </div>
          </fieldset>
        </div>

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
                  {pricingPreview
                    ? formatPricingAmount(pricingPreview.roomSubtotalBeforeDiscount, pricing.currency)
                    : "—"}
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
                  {pricingPreview
                    ? `−${formatPricingAmount(pricingPreview.roomDiscountAmount, pricing.currency)}`
                    : "—"}
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
                  {pricingPreview
                    ? formatPricingAmount(pricingPreview.roomSubtotalAfterDiscount, pricing.currency)
                    : "—"}
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
                  {pricingPreview
                    ? formatPricingAmount(pricingPreview.taxes.serviceChargeAmount, pricing.currency)
                    : "—"}
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
      </div>

      <fieldset className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-4 sm:px-5">
        <legend className="flex flex-wrap items-center gap-2 px-1 text-sm font-semibold text-slate-900">
          <span>Check-in attribution</span>
          <CheckInFieldInfo
            label="Checked in by"
            text="Records which hotel team member attended this guest at check-in. Always your signed-in account."
          />
        </legend>
        {checkInStaffOptions.length === 0 ? (
          <p className="text-sm text-amber-800">
            Your account is not linked to this hotel. Ask an administrator to add you under Settings → access
            before completing check-in.
          </p>
        ) : (
          <div className="space-y-2">
            <CheckInFieldLabelRow
              htmlFor="checkedInByUserId"
              helpTitle="Staff who checked the guest in"
              helpText="Recorded automatically as the account you are signed in with."
            >
              Checked in by <span className="text-rose-600">*</span>
            </CheckInFieldLabelRow>
            <p
              id="checkedInByUserId"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
            >
              {checkInStaffOptions[0]!.displayName}
            </p>
          </div>
        )}
      </fieldset>

      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-6">
        <Button
          type="submit"
          size="lg"
          disabled={loading || !occupancyCheck.ok || checkInStaffOptions.length === 0}
          className="rounded-xl px-8 font-semibold"
        >
          {loading ? "Checking in…" : "Complete check-in"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="rounded-xl" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
