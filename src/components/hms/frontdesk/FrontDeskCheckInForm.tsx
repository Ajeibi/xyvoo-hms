"use client";

import "react-phone-number-input/style.css";
import type { FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { isValidPhoneNumber } from "react-phone-number-input";
import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { BusinessSourceFieldset, SeasonRateTypeFieldset } from "@/components/hms/frontdesk/CheckInBusinessFields";
import { DiscountFieldset, SettlementBillingFieldset } from "@/components/hms/frontdesk/CheckInDiscountSettlementFields";
import {
  DocumentationFieldset,
  GuestRemarksFieldset,
  ReleaseExtensionFieldset,
  TaxExemptionsFieldset,
} from "@/components/hms/frontdesk/CheckInMiscFields";
import { CheckInPrimaryGuestFieldset } from "@/components/hms/frontdesk/CheckInPrimaryGuestFieldset";
import { CheckInRateSummaryCard } from "@/components/hms/frontdesk/CheckInRateSummaryCard";
import { CheckInRegistrationComplianceFieldset } from "@/components/hms/frontdesk/CheckInRegistrationComplianceFieldset";
import { AdditionalGuestsFieldset, StayInformationFieldset } from "@/components/hms/frontdesk/CheckInStayInformationFields";
import {
  emptyAccompanyingAdult,
  emptyMinorGuest,
  validateAccompanyingAdult,
  validateMinorGuest,
} from "@/components/hms/frontdesk/WalkInGuestDetailFields";
import { Button } from "@/components/ui/button";
import type { HotelPricingSetup, HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { NATIONAL_ID_ID_EXPIRY_PLACEHOLDER, type AccompanyingAdultGuest, type MinorGuest } from "@/lib/hms/walk-in-check-in-payload";
import type { CheckInFormInitialData } from "@/lib/hms/check-in-form-initial-data";
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
  /**
   * "check_in" (default) completes a walk-in stay immediately — marks the room occupied and
   * posts folio charges. "reserve" only books the stay ahead of arrival (status "confirmed"):
   * no room-occupied side effect, no folio posting, no check-in staff attribution required.
   */
  mode?: "check_in" | "reserve";
  /** Pre-fills every field from an already-booked reservation — used when completing check-in
   * for an existing reservation instead of capturing a brand-new guest/stay from scratch. */
  initialData?: CheckInFormInitialData;
  /** When set, submitting completes check-in for this existing reservation (update) rather than
   * creating a new one. */
  existingReservationId?: string;
};

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
  mode = "check_in",
  initialData,
  existingReservationId,
}: FrontDeskCheckInFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [assignedRoom, setAssignedRoom] = useState(() =>
    resolveAssignableRoomCode(initialData?.roomCode ?? searchParams.get("room") ?? defaultRoomCode, roomUnits),
  );

  const defaultType = roomTypes[0]?.id ?? "";

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [phone, setPhone] = useState<string | undefined>(initialData?.phone);
  const [primaryEmailInput, setPrimaryEmailInput] = useState(initialData?.email ?? "");
  const [roomTypeCode, setRoomTypeCode] = useState(initialData?.roomTypeCode || defaultType);
  const [arrivalDate, setArrivalDate] = useState(() => {
    if (initialData?.arrivalDate) return initialData.arrivalDate;
    const d = new Date();
    if (mode === "reserve") d.setDate(d.getDate() + 1);
    return localYmd(d);
  });
  const [departureDate, setDepartureDate] = useState(() => {
    if (initialData?.departureDate) return initialData.departureDate;
    const d = new Date();
    d.setDate(d.getDate() + (mode === "reserve" ? 2 : 1));
    return localYmd(d);
  });
  const [arrivalTime, setArrivalTime] = useState(() => initialData?.arrivalTime ?? localHHmm(new Date()));
  const [departureTime, setDepartureTime] = useState(initialData?.departureTime ?? defaultDepartureTime);
  /** String state so users can clear the field and type a new number (controlled number + `|| 1` forced "12" / blocked empty). */
  const [adultsInput, setAdultsInput] = useState(String(initialData?.adults ?? 1));
  const [childrenInput, setChildrenInput] = useState(String(initialData?.children ?? 0));
  const [infantsInput, setInfantsInput] = useState(String(initialData?.infants ?? 0));
  const [discountPercentInput, setDiscountPercentInput] = useState(
    initialData?.discountPercent ? String(initialData.discountPercent) : "",
  );
  const discountPercent = useMemo(() => {
    const t = discountPercentInput.trim().replace(",", ".");
    if (t === "" || t === ".") return 0;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  }, [discountPercentInput]);
  const [discountScope, setDiscountScope] = useState<DiscountScope>(initialData?.discountScope ?? "none");
  const [taxExemptVat, setTaxExemptVat] = useState(initialData?.taxExemptVat ?? false);
  const [taxExemptService, setTaxExemptService] = useState(initialData?.taxExemptServiceCharge ?? false);
  const [taxExemptState, setTaxExemptState] = useState(initialData?.taxExemptStateLevy ?? false);
  const [taxExemptStamp, setTaxExemptStamp] = useState(initialData?.taxExemptStampLevy ?? false);
  const [settlementMethod, setSettlementMethod] = useState<
    "cash" | "card" | "pos" | "split" | "direct_bill" | "partial_credit"
  >(initialData?.settlementMethod ?? "cash");
  const [guestTitle, setGuestTitle] = useState(initialData?.title ?? "");
  const [purposeOfVisit, setPurposeOfVisit] = useState<"leisure" | "business" | "transit">(
    initialData?.purposeOfVisit ?? "leisure",
  );
  const [idTypeField, setIdTypeField] = useState<"passport" | "national_id" | "drivers_license">(
    initialData?.idType ?? "national_id",
  );
  const [rateTypeField, setRateTypeField] = useState<"rack" | "corporate" | "walk_in_bar" | "promotional">(
    initialData?.rateType ?? "walk_in_bar",
  );
  const [marketSegmentField, setMarketSegmentField] = useState<
    "transient" | "corporate" | "group" | "government" | "wholesale"
  >(initialData?.marketSegment ?? "transient");
  const [sourceField, setSourceField] = useState<
    "walk_in" | "phone" | "referral" | "ota" | "website" | "travel_agent"
  >(initialData?.source ?? (mode === "reserve" ? "phone" : "walk_in"));
  const [additionalAdults, setAdditionalAdults] = useState<AccompanyingAdultGuest[]>(
    initialData?.additionalAdults ?? [],
  );
  const [childGuests, setChildGuests] = useState<MinorGuest[]>(initialData?.childGuests ?? []);
  const [infantGuests, setInfantGuests] = useState<MinorGuest[]>(initialData?.infantGuests ?? []);

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

    let checkedInByUserId: string | undefined;
    if (mode === "check_in") {
      checkedInByUserId = checkedInByUserIdField.trim();
      if (!checkedInByUserId || !checkInStaffOptions.some((o) => o.userId === checkedInByUserId)) {
        setError("Select the staff member who checked this guest in.");
        return;
      }
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
      checkInNow: mode === "check_in",
      reservationId: existingReservationId,
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
        const msg = data.error ?? (mode === "reserve" ? "Could not create reservation." : "Check-in failed.");
        setError(msg);
        toastError(mode === "reserve" ? "Reservation failed" : "Check-in failed", msg);
        return;
      }
      if (mode === "reserve") {
        toastSuccess("Reservation created", data.confirmationCode ? `Ref ${data.confirmationCode}` : undefined);
        router.push(`/hms/${slug}/frontdesk?reserved=${encodeURIComponent(data.confirmationCode ?? "1")}`);
      } else if (existingReservationId) {
        toastSuccess("Guest checked in", data.confirmationCode ? `Ref ${data.confirmationCode}` : undefined);
        router.push(`/hms/${slug}/reservations?checkedIn=${encodeURIComponent(data.confirmationCode ?? "1")}`);
      } else {
        toastSuccess("Guest checked in", data.confirmationCode ? `Ref ${data.confirmationCode}` : undefined);
        router.push(`/hms/${slug}/frontdesk?checkedIn=${encodeURIComponent(data.confirmationCode ?? "1")}`);
      }
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      toastError(mode === "reserve" ? "Reservation failed" : "Check-in failed", "Network error. Please try again.");
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
          <CheckInPrimaryGuestFieldset
            guestTitle={guestTitle}
            setGuestTitle={setGuestTitle}
            purposeOfVisit={purposeOfVisit}
            setPurposeOfVisit={setPurposeOfVisit}
            firstName={initialData?.firstName}
            lastName={initialData?.lastName}
            phone={phone}
            setPhone={setPhone}
            primaryEmailInput={primaryEmailInput}
            setPrimaryEmailInput={setPrimaryEmailInput}
            nationality={initialData?.nationality}
            idType={idTypeField}
            setIdType={setIdTypeField}
            idNumber={initialData?.idNumber}
            idExpiryDate={initialData?.idExpiryDate}
            dateOfBirth={initialData?.dateOfBirth}
          />

          <StayInformationFieldset
            arrivalDate={arrivalDate}
            setArrivalDate={setArrivalDate}
            arrivalTime={arrivalTime}
            setArrivalTime={setArrivalTime}
            departureDate={departureDate}
            setDepartureDate={setDepartureDate}
            departureTime={departureTime}
            setDepartureTime={setDepartureTime}
            nights={nights}
            roomTypeCode={roomTypeCode}
            setRoomTypeCode={setRoomTypeCode}
            roomTypes={roomTypes}
            roomTypePickerOptions={roomTypePickerOptions}
            selectedType={selectedType}
            effectiveOccupancyMax={effectiveOccupancyRoomType?.maxOccupancy}
            headcount={headcount}
            occupancyCheck={occupancyCheck}
            roomUnits={roomUnits}
            assignedRoom={assignedRoom}
            setAssignedRoom={setAssignedRoom}
            adultsInput={adultsInput}
            setAdultsInput={setAdultsInput}
            adults={adults}
            childrenInput={childrenInput}
            setChildrenInput={setChildrenInput}
            childrenCount={children}
            infantsInput={infantsInput}
            setInfantsInput={setInfantsInput}
            infants={infants}
          />

          <AdditionalGuestsFieldset
            additionalAdults={additionalAdults}
            setAdditionalAdults={setAdditionalAdults}
            childGuests={childGuests}
            setChildGuests={setChildGuests}
            infantGuests={infantGuests}
            setInfantGuests={setInfantGuests}
            phone={phone}
            primaryEmailInput={primaryEmailInput}
          />

          <SeasonRateTypeFieldset
            seasonCode={initialData?.seasonCode}
            rateType={rateTypeField}
            setRateType={setRateTypeField}
          />

          <DiscountFieldset
            discountPercentInput={discountPercentInput}
            setDiscountPercentInput={setDiscountPercentInput}
            discountScope={discountScope}
            setDiscountScope={setDiscountScope}
          />

          <TaxExemptionsFieldset
            taxExemptVat={taxExemptVat}
            setTaxExemptVat={setTaxExemptVat}
            taxExemptService={taxExemptService}
            setTaxExemptService={setTaxExemptService}
            taxExemptState={taxExemptState}
            setTaxExemptState={setTaxExemptState}
            taxExemptStamp={taxExemptStamp}
            setTaxExemptStamp={setTaxExemptStamp}
            taxExemptionReason={initialData?.taxExemptionReason}
            taxExemptionDocRef={initialData?.taxExemptionDocRef}
            fieldClass={fieldClass}
          />

          <SettlementBillingFieldset
            settlementMethod={settlementMethod}
            setSettlementMethod={setSettlementMethod}
            showPreauthField={showPreauthField}
            currency={pricing.currency}
            settlementType={initialData?.settlementType}
            preauthAmount={initialData?.preauthAmount}
            cardLast4={initialData?.cardLast4}
            cardExpiry={initialData?.cardExpiry}
            billToAccount={initialData?.billToAccount}
            poNumber={initialData?.poNumber}
          />

          <ReleaseExtensionFieldset
            currency={pricing.currency}
            guaranteeReleaseDate={initialData?.guaranteeReleaseDate}
            minPaymentPerDayToExtend={initialData?.minPaymentPerDayToExtend}
          />

          <GuestRemarksFieldset
            fieldClass={fieldClass}
            guestRemarksReservation={initialData?.guestRemarksReservation}
            guestRemarksCheckIn={initialData?.guestRemarksCheckIn}
            guestRemarksCheckOut={initialData?.guestRemarksCheckOut}
          />

          <BusinessSourceFieldset
            marketSegment={marketSegmentField}
            setMarketSegment={setMarketSegmentField}
            source={sourceField}
            setSource={setSourceField}
            currency={pricing.currency}
            bookingChannel={initialData?.bookingChannel}
            travelAgentName={initialData?.travelAgentName}
            commissionPlan={initialData?.commissionPlan}
            commissionValue={initialData?.commissionValue}
          />

          <DocumentationFieldset voucherNumber={initialData?.voucherNumber} />

          <CheckInRegistrationComplianceFieldset
            showRateOnRegistrationCard={initialData?.showRateOnRegistrationCard}
            generateBill={initialData?.generateBill}
            rateOverridden={initialData?.rateOverridden}
            rateOverrideReason={initialData?.rateOverrideReason}
            immigrationRegistrationRequired={initialData?.immigrationRegistrationRequired}
            vipFlag={initialData?.vipFlag}
          />
        </div>

        <CheckInRateSummaryCard nightlyBar={nightlyBar} nights={nights} pricing={pricing} pricingPreview={pricingPreview} />
      </div>

      {mode === "check_in" && (
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
      )}

      <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-6">
        <Button
          type="submit"
          size="lg"
          disabled={loading || !occupancyCheck.ok || (mode === "check_in" && checkInStaffOptions.length === 0)}
          className="rounded-xl px-8 font-semibold"
        >
          {mode === "reserve"
            ? loading
              ? "Creating reservation…"
              : "Create reservation"
            : loading
              ? "Checking in…"
              : "Complete check-in"}
        </Button>
        <Button type="button" variant="outline" size="lg" className="rounded-xl" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
