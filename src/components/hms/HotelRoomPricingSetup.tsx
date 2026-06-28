"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType, type SVGProps } from "react";
import { countries } from "countries-list";
import * as FlagIcons from "country-flag-icons/react/3x2";
import { BedDouble, Building2, ChevronDown, CircleHelp, Plus, Search, Trash2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type {
  HotelPricingSetup,
  HotelRoomTypeSetup,
} from "@/lib/hms/room-pricing";
import {
  ANYTIME_CHECK_IN,
  formatPricingAmount,
  formatPricingTime,
  getRoomPricingSummary,
  roomTypeGridAbbrev,
} from "@/lib/hms/room-pricing";
import {
  getFloorPlanEffectiveTarget,
  getFloorPlanRoomTotal,
  getFloorPlanTargetRoomCount,
  isFloorPlanComplete,
  normalizeFloorPlan,
  type HotelFloorPlanEntry,
} from "@/lib/hms/floor-plan";
import { expandRoomNumbersSpec, parseRoomNumbersSpec } from "@/lib/hms/room-numbering";
import { cn } from "@/lib/utils";
import {
  RoomInventoryTypeAssignment,
  buildRoomTypeOptionsFromDrafts,
} from "@/components/hms/settings/RoomInventoryTypeAssignment";

type PricingSetupDraft = {
  currency: string;
  taxRate: string;
  serviceChargeRate: string;
  extraAdultRate: string;
  extraChildRate: string;
  checkInMode: "anytime" | "fixed";
  checkInTime: string;
  checkOutTime: string;
};

type FloorRowDraft = {
  id: string;
  floor: string;
  room_count: string;
  /** User text: ranges / comma list / segments (see parseRoomNumbersSpec). Empty = keep existing key numbers. */
  room_numbers: string;
};

function newFloorRowId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `floor-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toFloorRowsFromPlan(plan: HotelFloorPlanEntry[]): FloorRowDraft[] {
  if (plan.length === 0) return [];
  return plan.map((row) => ({
    id: newFloorRowId(),
    floor: String(row.floor),
    room_count: String(row.room_count),
    room_numbers: row.room_codes?.length ? row.room_codes.join(", ") : "",
  }));
}

/** Counts only (for totals / completeness). Ignores room number text. */
function toFloorPlanPayloadCountsOnly(rows: FloorRowDraft[]): HotelFloorPlanEntry[] {
  const raw = rows
    .map((r) => ({
      floor: Math.trunc(Number(r.floor)),
      room_count: Math.trunc(Number(r.room_count)),
    }))
    .filter((r) => Number.isFinite(r.floor) && Number.isFinite(r.room_count) && r.floor >= 1 && r.room_count >= 1);
  return normalizeFloorPlan(raw);
}

function toFloorPlanPayloadWithCodes(
  rows: FloorRowDraft[],
): { ok: true; entries: HotelFloorPlanEntry[] } | { ok: false; error: string } {
  const raw: Array<{ floor: number; room_count: number; room_codes?: string[] }> = [];
  for (const r of rows) {
    const floor = Math.trunc(Number(r.floor));
    const room_count = Math.trunc(Number(r.room_count));
    if (!Number.isFinite(floor) || !Number.isFinite(room_count) || floor < 1 || room_count < 1) {
      continue;
    }
    const spec = r.room_numbers.trim();
    if (spec) {
      const parsed = parseRoomNumbersSpec(spec, room_count);
      if (!parsed.ok) {
        return { ok: false, error: `Floor ${floor}: ${parsed.error}` };
      }
      raw.push({ floor, room_count, room_codes: parsed.codes });
    } else {
      raw.push({ floor, room_count });
    }
  }
  return { ok: true, entries: normalizeFloorPlan(raw) };
}

function buildCodeToFloorsFromDrafts(rows: FloorRowDraft[]): Map<string, Set<number>> {
  const codeToFloors = new Map<string, Set<number>>();
  for (const r of rows) {
    const floor = Math.trunc(Number(r.floor));
    const spec = r.room_numbers.trim();
    if (!spec || !Number.isFinite(floor) || floor < 1) continue;
    const expanded = expandRoomNumbersSpec(spec);
    if (!expanded.ok) continue;
    for (const c of expanded.codes) {
      const t = c.trim();
      if (!codeToFloors.has(t)) codeToFloors.set(t, new Set());
      codeToFloors.get(t)!.add(floor);
    }
  }
  return codeToFloors;
}

type CurrencyOption = {
  id: string;
  countryCode: string;
  countryName: string;
  currencyCode: string;
  currencyName: string;
  searchValue: string;
};

function numberToDraft(value: number, blankWhenZero = true) {
  if (!Number.isFinite(value)) return "";
  if (value === 0 && blankWhenZero) return "";
  return String(value);
}

function sanitizeIntegerInput(value: string) {
  return value.replace(/[^\d]/g, "");
}

function sanitizeDecimalInput(value: string) {
  const cleaned = value.replace(/[^\d.]/g, "");
  if (!cleaned) return "";

  const [whole, ...rest] = cleaned.split(".");
  const decimals = rest.join("").slice(0, 2);
  const hasDecimal = cleaned.includes(".");

  if (cleaned.startsWith(".")) {
    return `0.${decimals}`;
  }

  return hasDecimal ? `${whole}.${decimals}` : whole;
}

function findDuplicateRoomCodesAcrossFloors(entries: HotelFloorPlanEntry[]): string | null {
  const codeToFloors = new Map<string, Set<number>>();
  for (const e of entries) {
    if (!e.room_codes?.length) continue;
    for (const c of e.room_codes) {
      const t = c.trim();
      if (!codeToFloors.has(t)) codeToFloors.set(t, new Set());
      codeToFloors.get(t)!.add(e.floor);
    }
  }
  for (const [code, floors] of codeToFloors) {
    if (floors.size <= 1) continue;
    const list = [...floors].sort((a, b) => a - b);
    return `Room number "${code}" is assigned on more than one floor (${list.join(", ")}). Each room number can exist only once in the whole hotel — change one of the ranges so no floor shares numbers with another.`;
  }
  return null;
}

function floorRowNumberingFeedback(
  row: FloorRowDraft,
  codeToFloors: Map<string, Set<number>>,
): { kind: "ok" | "error" | "empty"; text: string } {
  const spec = row.room_numbers.trim();
  if (!spec) {
    return {
      kind: "empty",
      text: "Not set — existing key numbers stay as they are until you add a range or list here.",
    };
  }
  const rc = Math.trunc(Number(row.room_count));
  const floor = Math.trunc(Number(row.floor));
  if (!Number.isFinite(rc) || rc < 1) {
    return {
      kind: "error",
      text: 'Enter a valid "Rooms on floor" count first so numbering can be checked.',
    };
  }
  const expanded = expandRoomNumbersSpec(spec);
  if (!expanded.ok) return { kind: "error", text: expanded.error };

  const overlapping = [...new Set(expanded.codes.filter((x) => (codeToFloors.get(x)?.size ?? 0) > 1))];
  if (overlapping.length > 0) {
    const fl = codeToFloors.get(overlapping[0]!);
    const otherFloors = fl
      ? [...fl].filter((f) => f !== floor).sort((a, b) => a - b)
      : [];
    const preview = overlapping
      .slice(0, 8)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .join(", ");
    const more = overlapping.length > 8 ? ", …" : "";
    const overlapText = `These room numbers are already used on floor(s) ${otherFloors.join(", ")}: ${preview}${more}. Each number can only belong to one floor — change this floor's range or the other floor's.`;
    const p = parseRoomNumbersSpec(spec, rc);
    if (!p.ok) {
      return { kind: "error", text: `${overlapText} ${p.error}` };
    }
    return { kind: "error", text: overlapText };
  }

  const p = parseRoomNumbersSpec(spec, rc);
  if (!p.ok) return { kind: "error", text: p.error };

  return {
    kind: "ok",
    text: `Ready — ${p.codes.length} number(s) will apply to keys on this floor (sorted by current number, then save).`,
  };
}

type RoomTypeDraft = {
  id: string;
  name: string;
  shortLabel: string;
  rooms: string;
  maxOccupancy: string;
  baseRate: string;
  boardBasis: string;
};

function createEmptyRoomType(): RoomTypeDraft {
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `room-type-${Date.now()}`,
    name: "",
    shortLabel: "",
    rooms: "",
    maxOccupancy: "",
    baseRate: "",
    boardBasis: "Room only",
  };
}

function toRoomTypeDraft(roomType: HotelRoomTypeSetup): RoomTypeDraft {
  return {
    id: roomType.id,
    name: roomType.name,
    shortLabel: roomType.shortLabel ?? "",
    rooms: String(roomType.rooms),
    maxOccupancy: String(roomType.maxOccupancy),
    baseRate: numberToDraft(roomType.baseRate),
    boardBasis: roomType.boardBasis,
  };
}

function toRoomTypePayload(roomType: RoomTypeDraft): HotelRoomTypeSetup {
  const sl = roomType.shortLabel.trim();
  return {
    id: roomType.id,
    name: roomType.name.trim(),
    ...(sl.length > 0 ? { shortLabel: sl.slice(0, 8) } : {}),
    rooms: Number(roomType.rooms || 0),
    maxOccupancy: Number(roomType.maxOccupancy || 0),
    baseRate: Number(roomType.baseRate || 0),
    boardBasis: roomType.boardBasis.trim(),
  };
}

function toPricingDraft(pricingSetup: HotelPricingSetup): PricingSetupDraft {
  return {
    currency: pricingSetup.currency,
    taxRate: numberToDraft(pricingSetup.taxRate),
    serviceChargeRate: numberToDraft(pricingSetup.serviceChargeRate),
    extraAdultRate: numberToDraft(pricingSetup.extraAdultRate),
    extraChildRate: numberToDraft(pricingSetup.extraChildRate),
    checkInMode:
      pricingSetup.checkInTime === ANYTIME_CHECK_IN ? "anytime" : "fixed",
    checkInTime:
      pricingSetup.checkInTime === ANYTIME_CHECK_IN ? "" : pricingSetup.checkInTime,
    checkOutTime: pricingSetup.checkOutTime,
  };
}

function toPricingPayload(pricingSetup: PricingSetupDraft): HotelPricingSetup {
  return {
    currency: pricingSetup.currency.trim().toUpperCase(),
    taxRate: Number(pricingSetup.taxRate || 0),
    serviceChargeRate: Number(pricingSetup.serviceChargeRate || 0),
    extraAdultRate: Number(pricingSetup.extraAdultRate || 0),
    extraChildRate: Number(pricingSetup.extraChildRate || 0),
    checkInTime:
      pricingSetup.checkInMode === "anytime"
        ? ANYTIME_CHECK_IN
        : pricingSetup.checkInTime,
    checkOutTime: pricingSetup.checkOutTime,
  };
}

function buildTimeOptions() {
  const options: Array<{ value: string; label: string }> = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 30) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      options.push({
        value,
        label: formatPricingTime(value),
      });
    }
  }

  return options;
}

const TIME_OPTIONS = buildTimeOptions();
const FLAG_COMPONENTS = FlagIcons as Record<string, ComponentType<SVGProps<SVGSVGElement>>>;
const CURRENCY_DISPLAY_NAMES =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "currency" })
    : null;

function getPrimaryCurrencyCode(currency: unknown) {
  if (Array.isArray(currency)) {
    return typeof currency[0] === "string" ? currency[0].trim().toUpperCase() : "";
  }

  return typeof currency === "string" ? currency.trim().toUpperCase() : "";
}

function getCurrencyName(currencyCode: string) {
  return CURRENCY_DISPLAY_NAMES?.of(currencyCode) || currencyCode;
}

const CURRENCY_OPTIONS: CurrencyOption[] = Object.entries(countries)
  .filter(([countryCode, country]) => country.continent === "AF" || countryCode === "US")
  .map(([countryCode, country]) => {
    const currencyCode = getPrimaryCurrencyCode(country.currency);
    if (!currencyCode) return null;

    const currencyName = getCurrencyName(currencyCode);

    return {
      id: `${countryCode}-${currencyCode}`,
      countryCode,
      countryName: country.name,
      currencyCode,
      currencyName,
      searchValue: `${country.name} ${currencyName} ${currencyCode} ${countryCode}`.toLowerCase(),
    };
  })
  .filter((option): option is CurrencyOption => Boolean(option))
  .sort((a, b) => {
    if (a.countryCode === "US") return 1;
    if (b.countryCode === "US") return -1;
    return a.countryName.localeCompare(b.countryName);
  });

export default function HotelRoomPricingSetup({
  slug,
  initialRoomTypes,
  initialPricingSetup,
  initialFloorPlan,
  signupRoomCount,
  inventoryRoomCount = 0,
}: {
  slug: string;
  initialRoomTypes: HotelRoomTypeSetup[];
  initialPricingSetup: HotelPricingSetup;
  initialFloorPlan: HotelFloorPlanEntry[];
  signupRoomCount: number;
  /** Physical keys in `hotel.room_units`; when greater than zero, floor totals must match this count. */
  inventoryRoomCount?: number;
}) {
  const [floorRows, setFloorRows] = useState<FloorRowDraft[]>(() => {
    if (initialFloorPlan.length > 0) return toFloorRowsFromPlan(initialFloorPlan);
    return [];
  });
  const [roomTypes, setRoomTypes] = useState<RoomTypeDraft[]>(
    initialRoomTypes.length
      ? initialRoomTypes.map(toRoomTypeDraft)
      : [createEmptyRoomType()],
  );
  const [pricingSetup, setPricingSetup] = useState(
    toPricingDraft(initialPricingSetup),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeHelpId, setActiveHelpId] = useState<string | null>(null);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [currencyQuery, setCurrencyQuery] = useState("");
  const [selectedCurrencyOptionId, setSelectedCurrencyOptionId] = useState<
    string | null
  >(() => {
    const match = CURRENCY_OPTIONS.find(
      (option) => option.currencyCode === initialPricingSetup.currency.trim().toUpperCase(),
    );
    return match?.id ?? null;
  });
  const currencyPickerRef = useRef<HTMLDivElement | null>(null);
  const roomsPricingFormRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest("[data-field-help]")) {
        setActiveHelpId(null);
      }
      if (currencyPickerRef.current && !currencyPickerRef.current.contains(target)) {
        setCurrencyOpen(false);
        setCurrencyQuery("");
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActiveHelpId(null);
        setCurrencyOpen(false);
        setCurrencyQuery("");
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const sortedRates = useMemo(
    () =>
      roomTypes
        .map((roomType) => Number(roomType.baseRate || 0))
        .filter((value) => value > 0)
        .sort((a, b) => a - b),
    [roomTypes],
  );
  const roomPricingSummary = useMemo(
    () =>
      getRoomPricingSummary(
        roomTypes.map(toRoomTypePayload),
        signupRoomCount,
      ),
    [roomTypes, signupRoomCount],
  );
  const floorTargetRooms = useMemo(() => {
    const catalog = getFloorPlanTargetRoomCount(
      signupRoomCount,
      roomPricingSummary.configuredRooms,
    );
    return getFloorPlanEffectiveTarget(catalog, inventoryRoomCount);
  }, [signupRoomCount, roomPricingSummary.configuredRooms, inventoryRoomCount]);
  const selectedCurrencyOption = useMemo(
    () =>
      CURRENCY_OPTIONS.find((option) => option.id === selectedCurrencyOptionId) ||
      CURRENCY_OPTIONS.find((option) => option.currencyCode === pricingSetup.currency) ||
      null,
    [pricingSetup.currency, selectedCurrencyOptionId],
  );
  const filteredCurrencyOptions = useMemo(() => {
    const query = currencyQuery.trim().toLowerCase();
    if (!query) return CURRENCY_OPTIONS;
    return CURRENCY_OPTIONS.filter((option) => option.searchValue.includes(query));
  }, [currencyQuery]);

  const updateRoomType = (
    id: string,
    field: keyof RoomTypeDraft,
    value: string,
  ) => {
    setRoomTypes((current) =>
      current.map((roomType) =>
        roomType.id === id ? { ...roomType, [field]: value } : roomType,
      ),
    );
  };

  const addRoomType = () => {
    setRoomTypes((current) => [...current, createEmptyRoomType()]);
  };

  const removeRoomType = (id: string) => {
    setRoomTypes((current) =>
      current.length > 1 ? current.filter((roomType) => roomType.id !== id) : current,
    );
  };

  const floorPlanForTotals = useMemo(() => toFloorPlanPayloadCountsOnly(floorRows), [floorRows]);
  const floorRoomCodeToFloors = useMemo(() => buildCodeToFloorsFromDrafts(floorRows), [floorRows]);
  const floorAllocated = useMemo(
    () => getFloorPlanRoomTotal(floorPlanForTotals),
    [floorPlanForTotals],
  );
  const floorPlanOk = useMemo(
    () => isFloorPlanComplete(floorPlanForTotals, floorTargetRooms),
    [floorPlanForTotals, floorTargetRooms],
  );

  /** Counts only: floor rows sum to hotel total (or empty plan = valid default). Does not include room numbering. */
  const floorCountsAligned = useMemo(() => {
    if (floorTargetRooms <= 0) return false;
    return floorPlanOk;
  }, [floorTargetRooms, floorPlanOk]);

  const allFloorsHaveValidNumbering = useMemo(
    () =>
      floorRows.length > 0 &&
      floorRows.every((r) => {
        const s = r.room_numbers.trim();
        if (!s) return false;
        return floorRowNumberingFeedback(r, floorRoomCodeToFloors).kind === "ok";
      }),
    [floorRows, floorRoomCodeToFloors],
  );

  const someFloorMissingNumbering = useMemo(
    () => floorRows.length > 0 && floorPlanOk && floorRows.some((r) => !r.room_numbers.trim()),
    [floorRows, floorPlanOk],
  );

  const someFloorNumberingError = useMemo(
    () =>
      floorRows.length > 0 &&
      floorRows.some((r) => floorRowNumberingFeedback(r, floorRoomCodeToFloors).kind === "error"),
    [floorRows, floorRoomCodeToFloors],
  );

  const updateFloorRow = (id: string, field: keyof FloorRowDraft, value: string) => {
    setFloorRows((current) =>
      current.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  const addFloorRow = () => {
    setFloorRows((current) => {
      const floors = current.map((r) => Number(r.floor)).filter((n) => Number.isFinite(n) && n >= 1);
      const next = floors.length ? Math.max(...floors) + 1 : 1;
      return [...current, { id: newFloorRowId(), floor: String(next), room_count: "", room_numbers: "" }];
    });
  };

  const removeFloorRow = (id: string) => {
    setFloorRows((current) => current.filter((row) => row.id !== id));
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const payloadRoomTypes = roomTypes.map(toRoomTypePayload);
    const payloadPricingSetup = toPricingPayload(pricingSetup);
    const builtPlan = toFloorPlanPayloadWithCodes(floorRows);
    if (!builtPlan.ok) {
      setLoading(false);
      setError(builtPlan.error);
      return;
    }
    const floorPayload = builtPlan.entries;
    const dupAcrossFloors = findDuplicateRoomCodesAcrossFloors(floorPayload);
    if (dupAcrossFloors) {
      setLoading(false);
      setError(dupAcrossFloors);
      return;
    }
    const catalogTarget = getFloorPlanTargetRoomCount(
      signupRoomCount,
      payloadRoomTypes.reduce((sum, rt) => sum + rt.rooms, 0),
    );
    const saveFloorTarget = getFloorPlanEffectiveTarget(catalogTarget, inventoryRoomCount);

    if (saveFloorTarget > 0 && !isFloorPlanComplete(floorPayload, saveFloorTarget)) {
      setLoading(false);
      setError(
        inventoryRoomCount > 0
          ? `Floor plan must allocate exactly ${saveFloorTarget} room keys across floors (currently ${getFloorPlanRoomTotal(floorPayload)}), or remove all floor rows to keep every key on the ground floor.`
          : `Floor plan must allocate exactly ${saveFloorTarget} rooms across floors (currently ${getFloorPlanRoomTotal(floorPayload)}), or remove all floor rows to keep every room on the ground floor.`,
      );
      return;
    }

    const payload = {
      slug,
      roomTypes: payloadRoomTypes,
      pricingSetup: payloadPricingSetup,
      floorPlan: floorPayload,
    };

    const res = await fetch("/api/hotel/rooms-pricing", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      const msg = data.error || "Unable to save room and pricing setup.";
      setError(msg);
      toastError("Could not save setup", msg);
      return;
    }

    setRoomTypes((data.room_types || payloadRoomTypes).map(toRoomTypeDraft));
    setPricingSetup(toPricingDraft(data.pricing_setup || payloadPricingSetup));
    const savedPlan = normalizeFloorPlan(data.floor_plan ?? floorPayload);
    setFloorRows(savedPlan.length > 0 ? toFloorRowsFromPlan(savedPlan) : []);
    const n = typeof data.room_unit_floor_updates === "number" ? data.room_unit_floor_updates : 0;
    const nc = typeof data.room_unit_code_updates === "number" ? data.room_unit_code_updates : 0;
    const parts: string[] = [];
    if (n > 0) parts.push(`floor on ${n} key(s)`);
    if (nc > 0) parts.push(`room number on ${nc} key(s)`);
    toastSuccess(
      "Rooms and pricing saved",
      parts.length > 0
        ? `Updated ${parts.join(" and ")}.`
        : "The dashboard will use this configuration.",
    );
  };

  return (
    <form
      id="rooms-pricing-setup-form"
      ref={roomsPricingFormRef}
      onSubmit={handleSave}
      className="rounded-xl border border-slate-200 bg-white p-6 space-y-6 scroll-mt-24"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">
            Super Admin Setup: Rooms & Pricing
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">
            Define room types, default sell rates, and hotel-wide pricing rules here so
            department staff can focus on daily operations instead of setup.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs text-slate-500 sm:min-w-[260px]">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="uppercase tracking-wider text-[10px] text-slate-400">
              Configured rooms
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {roomPricingSummary.configuredRooms}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="uppercase tracking-wider text-[10px] text-slate-400">
              Remaining rooms
            </p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {roomPricingSummary.remainingRooms}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 col-span-2">
            <p className="uppercase tracking-wider text-[10px] text-slate-400">
              Rate range
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {sortedRates.length
                ? `${formatPricingAmount(sortedRates[0], pricingSetup.currency || "NGN")} - ${formatPricingAmount(sortedRates[sortedRates.length - 1], pricingSetup.currency || "NGN")}`
                : "Not configured"}
            </p>
          </div>
        </div>
      </div>

      <div
        id="floor-plan-setup"
        className="scroll-mt-24 rounded-xl border border-slate-200 bg-slate-50/40 p-5 space-y-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-700 ring-1 ring-slate-200">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-800">Floors & room counts</h3>
              <p className="mt-1 max-w-2xl text-xs leading-6 text-slate-500">
                Optionally split your hotel across physical floors. Saving updates the{" "}
                <span className="font-medium text-slate-600">floor</span> field on each physical
                room key in inventory so the dashboard matches this plan. You can also set{" "}
                <span className="font-medium text-slate-600">room numbers per floor</span> (ranges
                like 1–40, comma lists, or scattered segments with &quot;;&quot;). Leave numbering
                blank to keep existing key labels. Totals follow registration or room-type counts
                when no keys exist yet; once keys exist, floor totals must match key count. With no
                floor rows, every key stays on the ground floor (floor 1).
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={addFloorRow}
            className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add floor
          </button>
        </div>

        {floorTargetRooms <= 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
            Add room types with how many keys you sell for each category (or complete registration
            with a hotel room total). Then you can map floors here, or leave floors empty to keep
            everything on the ground floor.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span
                className={cn(
                  "rounded-full px-3 py-1 font-medium ring-1",
                  floorCountsAligned
                    ? "bg-emerald-50 font-semibold text-emerald-800 ring-emerald-200"
                    : "bg-white text-slate-700 ring-slate-200",
                )}
              >
                Hotel total: <span className="text-slate-900">{floorTargetRooms}</span> rooms
                {inventoryRoomCount > 0 ? (
                  <span className="font-normal text-slate-500"> (from room keys)</span>
                ) : signupRoomCount > 0 ? (
                  <span className="font-normal text-slate-500"> (registration)</span>
                ) : (
                  <span className="font-normal text-slate-500"> (from room types)</span>
                )}
              </span>
              <span
                className={cn(
                  "rounded-full px-3 py-1 font-medium ring-1",
                  floorCountsAligned
                    ? "bg-emerald-50 font-semibold text-emerald-800 ring-emerald-200"
                    : "bg-white text-slate-700 ring-slate-200",
                )}
              >
                {floorRows.length === 0 ? (
                  <>
                    Floor rows: <span className="text-slate-900">0</span>
                    <span className="font-normal text-slate-500"> (all on ground)</span>
                  </>
                ) : (
                  <>
                    Rooms on listed floors: <span className="text-slate-900">{floorAllocated}</span>
                  </>
                )}
              </span>
              {floorPlanOk && floorRows.length === 0 ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  Ground floor (default)
                </span>
              ) : floorPlanOk ? (
                <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  Floor counts match
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-900 ring-1 ring-amber-200">
                  Totals must match before save
                </span>
              )}
              {floorPlanOk && floorRows.length > 0 ? (
                someFloorNumberingError ? (
                  <span className="rounded-full bg-rose-50 px-3 py-1 font-semibold text-rose-800 ring-1 ring-rose-200">
                    Fix room numbering errors
                  </span>
                ) : allFloorsHaveValidNumbering ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    Room numbers set on all floors
                  </span>
                ) : someFloorMissingNumbering ? (
                  <span className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-600 ring-1 ring-slate-200">
                    Room numbers optional — not set on every floor
                  </span>
                ) : null
              ) : null}
            </div>

            {floorRows.length === 0 ? (
              <div className="space-y-2">
                <p className="text-xs leading-6 text-slate-600">
                  No floor breakdown yet — all {floorTargetRooms} room(s) are counted on the ground
                  floor. Use &quot;Add floor&quot; or the button below when you want to model upper
                  floors.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setFloorRows([{ id: newFloorRowId(), floor: "1", room_count: "", room_numbers: "" }])
                  }
                  className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-3 text-sm font-medium text-slate-600 hover:border-slate-400 hover:text-slate-800"
                >
                  Start floor breakdown
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {floorRows.map((row) => {
                  const numFb = floorRowNumberingFeedback(row, floorRoomCodeToFloors);
                  const rcNum = Math.trunc(Number(row.room_count));
                  const floorNum = Math.trunc(Number(row.floor));
                  const startEx =
                    Number.isFinite(floorNum) && floorNum >= 1 ? floorNum * 100 : 100;
                  const numberingPlaceholder =
                    Number.isFinite(rcNum) && rcNum >= 1
                      ? `e.g. ${startEx}–${startEx + rcNum - 1} (${rcNum} rooms; both ends count) or 10,12,14; 20–22 with ";" between parts`
                      : 'e.g. 100–117 or 10,12,14; 20–25 (use ";" for separate ranges; both ends count)';
                  return (
                    <div
                      key={row.id}
                      className="space-y-3 rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[100px] flex-1 space-y-1.5">
                          <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            Floor #
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.floor}
                            onChange={(e) =>
                              updateFloorRow(row.id, "floor", sanitizeIntegerInput(e.target.value))
                            }
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-900 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                            placeholder="1"
                          />
                        </div>
                        <div className="min-w-[120px] flex-[2] space-y-1.5">
                          <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            Rooms on floor
                          </label>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={row.room_count}
                            onChange={(e) =>
                              updateFloorRow(row.id, "room_count", sanitizeIntegerInput(e.target.value))
                            }
                            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 text-sm text-slate-900 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                            placeholder="e.g. 10"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFloorRow(row.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                          aria-label="Remove floor row"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="space-y-1.5 border-t border-slate-100 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                            Room numbers on this floor
                          </label>
                          <button
                            type="button"
                            onClick={() => updateFloorRow(row.id, "room_numbers", "")}
                            disabled={!row.room_numbers.trim()}
                            className="text-[11px] font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline disabled:pointer-events-none disabled:opacity-40"
                          >
                            Clear numbering
                          </button>
                        </div>
                        <textarea
                          value={row.room_numbers}
                          onChange={(e) => updateFloorRow(row.id, "room_numbers", e.target.value)}
                          rows={2}
                          placeholder={numberingPlaceholder}
                          className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:border-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-100"
                        />
                        <p
                          className={cn(
                            "text-[11px] leading-relaxed",
                            numFb.kind === "error"
                              ? "text-rose-600"
                              : numFb.kind === "ok"
                                ? "text-emerald-700"
                                : "text-slate-500",
                          )}
                        >
                          {numFb.text}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {floorPlanOk ? (
                  <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      Saving applies floors, room numbers, room types, and pricing together (same as
                      the button at the bottom of this page).
                    </p>
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => roomsPricingFormRef.current?.requestSubmit()}
                      className="inline-flex shrink-0 items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Save floors and room numbers
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </>
        )}
      </div>

      {roomPricingSummary.excessRooms > 0 ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs leading-6 text-rose-700">
          Total hotel rooms recorded:{" "}
          <span className="font-semibold">{roomPricingSummary.totalRooms}</span>. Configured
          into priced room types:{" "}
          <span className="font-semibold">{roomPricingSummary.configuredRooms}</span>. This is{" "}
          <span className="font-semibold">{roomPricingSummary.excessRooms}</span> over the
          recorded total. Review the room counts so your setup stays accurate.
        </div>
      ) : roomPricingSummary.remainingRooms > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-6 text-amber-800">
          Total hotel rooms recorded:{" "}
          <span className="font-semibold">{roomPricingSummary.totalRooms}</span>. Configured
          into priced room types:{" "}
          <span className="font-semibold">{roomPricingSummary.configuredRooms}</span>. Still
          unconfigured:{" "}
          <span className="font-semibold">{roomPricingSummary.remainingRooms}</span>. Break
          the remaining rooms into actual room types below so the dashboard and room pages
          can show real operational detail.
        </div>
      ) : (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3 text-xs leading-6 text-emerald-800">
          All <span className="font-semibold">{roomPricingSummary.totalRooms}</span> rooms
          have been assigned to priced room types. Your room setup is complete.
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Room Types</h3>
            <p className="text-xs text-slate-500">
              Add the room categories your property sells and the default starting rate for each.
            </p>
          </div>
          <button
            type="button"
            onClick={addRoomType}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            Add room type
          </button>
        </div>

        <div className="space-y-4">
          {roomTypes.map((roomType, index) => (
            <div
              key={roomType.id}
              className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <BedDouble className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      Room type {index + 1}
                    </p>
                    <p className="text-xs text-slate-500">
                      Configure name, inventory, occupancy, and default sell rate.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeRoomType(roomType.id)}
                  disabled={roomTypes.length === 1}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
                <div className="xl:col-span-2">
                  <FieldLabel
                    label="Room type name"
                    helpId={`room-type-name-${roomType.id}`}
                    activeHelpId={activeHelpId}
                    onToggleHelp={setActiveHelpId}
                  />
                  <input
                    value={roomType.name}
                    onChange={(event) =>
                      updateRoomType(roomType.id, "name", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    placeholder="e.g. Deluxe King"
                    required
                  />
                </div>
                <div>
                  <FieldLabel
                    label="Grid label (optional)"
                    helpId={`room-type-short-${roomType.id}`}
                    helpText="Short tag on the front desk room grid (e.g. SS, SU). Use when two types would abbreviate the same."
                    activeHelpId={activeHelpId}
                    onToggleHelp={setActiveHelpId}
                  />
                  <input
                    value={roomType.shortLabel}
                    onChange={(event) =>
                      updateRoomType(
                        roomType.id,
                        "shortLabel",
                        event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8),
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm uppercase text-slate-800 tracking-wide"
                    placeholder="e.g. SS"
                    maxLength={8}
                  />
                </div>
                <div>
                  <FieldLabel
                    label="Number of rooms"
                    helpId={`room-count-${roomType.id}`}
                    activeHelpId={activeHelpId}
                    onToggleHelp={setActiveHelpId}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={roomType.rooms}
                    onChange={(event) =>
                      updateRoomType(
                        roomType.id,
                        "rooms",
                        sanitizeIntegerInput(event.target.value),
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    placeholder="e.g. 20"
                    required
                  />
                </div>
                <div>
                  <FieldLabel
                    label="Max occupancy"
                    helpId={`max-occupancy-${roomType.id}`}
                    activeHelpId={activeHelpId}
                    onToggleHelp={setActiveHelpId}
                  />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={roomType.maxOccupancy}
                    onChange={(event) =>
                      updateRoomType(
                        roomType.id,
                        "maxOccupancy",
                        sanitizeIntegerInput(event.target.value),
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    placeholder="e.g. 2"
                    required
                  />
                </div>
                <div>
                  <FieldLabel
                    label="Base rate"
                    helpId={`base-rate-${roomType.id}`}
                    helpText="The default starting selling price for one room of this type before tax, service charge, or extra guest fees are added."
                    activeHelpId={activeHelpId}
                    onToggleHelp={setActiveHelpId}
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={roomType.baseRate}
                    onChange={(event) =>
                      updateRoomType(
                        roomType.id,
                        "baseRate",
                        sanitizeDecimalInput(event.target.value),
                      )
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    placeholder="e.g. 27500"
                    required
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <FieldLabel
                    label="Board basis"
                    helpId={`board-basis-${roomType.id}`}
                    helpText="What the guest gets with the rate, such as Room only, Bed and breakfast, Half board, or Full board."
                    activeHelpId={activeHelpId}
                    onToggleHelp={setActiveHelpId}
                  />
                  <input
                    value={roomType.boardBasis}
                    onChange={(event) =>
                      updateRoomType(roomType.id, "boardBasis", event.target.value)
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
                    placeholder="Room only / Bed & breakfast"
                    required
                  />
                </div>
                <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                  <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    Preview
                  </p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {roomType.name || "Unnamed room type"}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {roomType.rooms || "0"} room(s), occupancy {roomType.maxOccupancy || "0"},{" "}
                    {roomType.boardBasis || "Room only"}
                  </p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    Grid:{" "}
                    {roomTypeGridAbbrev({
                      name: roomType.name || "Room",
                      shortLabel: roomType.shortLabel?.trim() || undefined,
                    })}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-blue-700">
                    {formatPricingAmount(
                      roomType.baseRate ? Number(roomType.baseRate) : null,
                      pricingSetup.currency || "NGN",
                    )}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <RoomInventoryTypeAssignment
          slug={slug}
          inventoryRoomCount={inventoryRoomCount}
          roomTypeOptions={buildRoomTypeOptionsFromDrafts(roomTypes)}
        />
      </div>

      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">Hotel-wide Pricing Rules</h3>
          <p className="text-xs text-slate-500">
            These defaults support dashboard reporting and give operational teams a shared pricing baseline.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <FieldLabel
              label="Currency"
              helpId="currency"
              helpText="The currency used for room rates and pricing calculations across the property, for example NGN or USD."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <CurrencyCombobox
              pickerRef={currencyPickerRef}
              open={currencyOpen}
              query={currencyQuery}
              selectedOption={selectedCurrencyOption}
              options={filteredCurrencyOptions}
              onOpenChange={setCurrencyOpen}
              onQueryChange={setCurrencyQuery}
              onSelect={(option) => {
                setSelectedCurrencyOptionId(option.id);
                setCurrencyQuery("");
                setCurrencyOpen(false);
                setPricingSetup((current) => ({
                  ...current,
                  currency: option.currencyCode,
                }));
              }}
            />
          </div>
          <div>
            <FieldLabel
              label="Tax rate (%)"
              helpId="tax-rate"
              helpText="The percentage tax applied on top of the base room rate."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <input
              type="text"
              inputMode="decimal"
              value={pricingSetup.taxRate}
              onChange={(event) =>
                setPricingSetup((current) => ({
                  ...current,
                  taxRate: sanitizeDecimalInput(event.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="e.g. 7.5"
            />
          </div>
          <div>
            <FieldLabel
              label="Service charge (%)"
              helpId="service-charge"
              helpText="An additional percentage fee charged by the hotel on top of the base rate."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <input
              type="text"
              inputMode="decimal"
              value={pricingSetup.serviceChargeRate}
              onChange={(event) =>
                setPricingSetup((current) => ({
                  ...current,
                  serviceChargeRate: sanitizeDecimalInput(event.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="e.g. 5"
            />
          </div>
          <div>
            <FieldLabel
              label="Extra adult rate"
              helpId="extra-adult-rate"
              helpText="The extra amount charged when an additional adult stays in the room beyond the standard occupancy included in the base rate."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <input
              type="text"
              inputMode="decimal"
              value={pricingSetup.extraAdultRate}
              onChange={(event) =>
                setPricingSetup((current) => ({
                  ...current,
                  extraAdultRate: sanitizeDecimalInput(event.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="e.g. 5000"
            />
          </div>
          <div>
            <FieldLabel
              label="Extra child rate"
              helpId="extra-child-rate"
              helpText="The extra amount charged when a child is added to the room beyond what is already included in the standard rate."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <input
              type="text"
              inputMode="decimal"
              value={pricingSetup.extraChildRate}
              onChange={(event) =>
                setPricingSetup((current) => ({
                  ...current,
                  extraChildRate: sanitizeDecimalInput(event.target.value),
                }))
              }
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800"
              placeholder="e.g. 2500"
            />
          </div>
          <div>
            <FieldLabel
              label="Check-in policy"
              helpId="check-in-policy"
              helpText="Use Anytime if guests can arrive at any time. Choose Specific time if your property has a standard check-in start time."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <Select
              value={pricingSetup.checkInMode}
              onValueChange={(value) =>
                setPricingSetup((current) => ({
                  ...current,
                  checkInMode: value as PricingSetupDraft["checkInMode"],
                  checkInTime:
                    value === "anytime"
                      ? ""
                      : current.checkInTime || "14:00",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select check-in policy" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anytime">Anytime</SelectItem>
                <SelectItem value="fixed">Specific time</SelectItem>
              </SelectContent>
            </Select>
            {pricingSetup.checkInMode === "fixed" && (
              <div className="mt-3">
                <Select
                value={pricingSetup.checkInTime}
                  onValueChange={(value) =>
                    setPricingSetup((current) => ({
                      ...current,
                      checkInTime: value,
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select check-in time" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-500">
              Current check-in:{" "}
              {pricingSetup.checkInMode === "anytime"
                ? "Anytime"
                : formatPricingTime(pricingSetup.checkInTime)}
            </p>
          </div>
          <div>
            <FieldLabel
              label="Check-out time"
              helpId="check-out-time"
              helpText="The standard time guests are expected to check out. This is often noon for many hotels."
              activeHelpId={activeHelpId}
              onToggleHelp={setActiveHelpId}
            />
            <Select
              value={pricingSetup.checkOutTime}
              onValueChange={(value) =>
                setPricingSetup((current) => ({
                  ...current,
                  checkOutTime: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select check-out time" />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <button
        type="submit"
        disabled={loading}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60 cursor-pointer"
      >
        {loading ? "Saving..." : "Save Rooms & Pricing"}
      </button>
    </form>
  );
}

function CurrencyCombobox({
  pickerRef,
  open,
  query,
  selectedOption,
  options,
  onOpenChange,
  onQueryChange,
  onSelect,
}: {
  pickerRef: React.RefObject<HTMLDivElement | null>;
  open: boolean;
  query: string;
  selectedOption: CurrencyOption | null;
  options: CurrencyOption[];
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (option: CurrencyOption) => void;
}) {
  return (
    <div ref={pickerRef} className="relative">
      <button
        type="button"
        onClick={() => {
          if (open) {
            onQueryChange("");
          }
          onOpenChange(!open);
        }}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-left text-sm text-slate-800 transition-colors hover:border-slate-300"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        {selectedOption ? (
          <div className="flex min-w-0 items-center gap-3">
            <CountryFlag
              countryCode={selectedOption.countryCode}
              countryName={selectedOption.countryName}
            />
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">
                {selectedOption.currencyCode} · {selectedOption.currencyName}
              </p>
              <p className="truncate text-xs text-slate-500">{selectedOption.countryName}</p>
            </div>
          </div>
        ) : (
          <span className="text-slate-400">Select a currency</span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg shadow-slate-200/70">
          <div className="border-b border-slate-100 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Search African countries or currency..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm text-slate-800 outline-none transition-colors focus:border-blue-300 focus:bg-white"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto py-1">
            {options.length ? (
              options.map((option) => {
                const isSelected = selectedOption?.id === option.id;

                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => onSelect(option)}
                    className={cn(
                      "flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors",
                      isSelected ? "bg-blue-50" : "hover:bg-slate-50",
                    )}
                  >
                    <CountryFlag
                      countryCode={option.countryCode}
                      countryName={option.countryName}
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {option.countryName}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {option.currencyName} ({option.currencyCode})
                      </p>
                    </div>
                  </button>
                );
              })
            ) : (
              <p className="px-3 py-4 text-sm text-slate-500">
                No currency matches that search.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CountryFlag({
  countryCode,
  countryName,
}: {
  countryCode: string;
  countryName: string;
}) {
  const FlagComponent = FLAG_COMPONENTS[countryCode.toUpperCase()];

  if (!FlagComponent) {
    return (
      <div className="flex h-4 w-6 shrink-0 items-center justify-center rounded-sm bg-slate-100 text-[10px] font-semibold text-slate-500">
        {countryCode.toUpperCase()}
      </div>
    );
  }

  return (
    <span
      role="img"
      aria-label={`${countryName} flag`}
      className="flex h-4 w-6 shrink-0 overflow-hidden rounded-[3px] border border-slate-200 bg-white"
    >
      <FlagComponent className="h-full w-full" />
    </span>
  );
}

function FieldLabel({
  label,
  helpId,
  helpText,
  activeHelpId,
  onToggleHelp,
}: {
  label: string;
  helpId: string;
  helpText?: string;
  activeHelpId: string | null;
  onToggleHelp: (helpId: string | null) => void;
}) {
  const isOpen = helpText ? activeHelpId === helpId : false;

  return (
    <div
      data-field-help
      className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-slate-500"
    >
      <span>{label}</span>
      {helpText ? (
        <div className="relative inline-block">
          <button
            type="button"
            aria-label={`Explain ${label}`}
            aria-expanded={isOpen}
            onClick={() => onToggleHelp(isOpen ? null : helpId)}
            className="cursor-pointer text-slate-400 transition-colors hover:text-slate-600"
          >
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
          {isOpen && (
            <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 text-xs font-normal leading-5 text-slate-600 shadow-lg">
              {helpText}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
