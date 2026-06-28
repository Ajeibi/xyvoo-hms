export type HotelRoomTypeSetup = {
  id: string;
  name: string;
  /** Optional short tag on the front desk room grid (e.g. SS, SU). */
  shortLabel?: string;
  rooms: number;
  maxOccupancy: number;
  baseRate: number;
  boardBasis: string;
};

/** Compact label for room grid: explicit shortLabel, else initials / two-letter fallback from name. */
export function roomTypeGridAbbrev(rt: Pick<HotelRoomTypeSetup, "name" | "shortLabel">): string {
  const manual = typeof rt.shortLabel === "string" ? rt.shortLabel.trim() : "";
  if (manual.length > 0) return manual.slice(0, 8);
  const words = rt.name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .map((w) => (w[0] ?? "").toUpperCase())
      .join("")
      .slice(0, 4);
  }
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return "?";
}

export type HotelPricingSetup = {
  currency: string;
  taxRate: number;
  serviceChargeRate: number;
  extraAdultRate: number;
  extraChildRate: number;
  checkInTime: string;
  checkOutTime: string;
};

export const ANYTIME_CHECK_IN = "anytime";

export const DEFAULT_PRICING_SETUP: HotelPricingSetup = {
  currency: "NGN",
  taxRate: 0,
  serviceChargeRate: 0,
  extraAdultRate: 0,
  extraChildRate: 0,
  checkInTime: ANYTIME_CHECK_IN,
  checkOutTime: "12:00",
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  AOA: "Kz",
  BIF: "FBu",
  BWP: "P",
  CDF: "FC",
  CVE: "Esc",
  DJF: "Fdj",
  DZD: "د.ج",
  EGP: "E£",
  ERN: "Nfk",
  ETB: "Br",
  EUR: "€",
  GHS: "GH₵",
  GMD: "D",
  GNF: "FG",
  KES: "KSh",
  KMF: "CF",
  LRD: "L$",
  LSL: "L",
  LYD: "ل.د",
  MAD: "DH",
  MGA: "Ar",
  MRU: "UM",
  MUR: "₨",
  MWK: "MK",
  MZN: "MT",
  NAD: "N$",
  NGN: "₦",
  RWF: "FRw",
  SCR: "₨",
  SDG: "ج.س.",
  SHP: "£",
  SLL: "Le",
  SOS: "Sh",
  SSP: "£",
  STN: "Db",
  SZL: "E",
  TND: "DT",
  TZS: "TSh",
  UGX: "USh",
  USD: "$",
  XAF: "FCFA",
  XOF: "CFA",
  ZAR: "R",
  ZMW: "ZK",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNonEmptyString(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() || fallback : fallback;
}

function toPositiveInt(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Math.round(num));
}

function toPositiveRate(value: unknown, fallback: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0, Number(num.toFixed(2)));
}

function toPercentage(value: unknown, fallback: number) {
  return Math.min(100, toPositiveRate(value, fallback));
}

function isTimeString(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function toTimeString(value: unknown, fallback: string) {
  const text = toNonEmptyString(value, fallback);
  return isTimeString(text) ? text : fallback;
}

function toCheckInString(value: unknown, fallback: string) {
  const text = toNonEmptyString(value, fallback).toLowerCase();
  if (text === ANYTIME_CHECK_IN) return ANYTIME_CHECK_IN;
  return isTimeString(text) ? text : fallback;
}

export function normalizeRoomTypes(input: unknown): HotelRoomTypeSetup[] {
  if (!Array.isArray(input)) return [];

  return input
    .map((item, index) => {
      if (!isObject(item)) return null;

      const name = toNonEmptyString(item.name);
      if (!name) return null;

      const shortRaw = toNonEmptyString(item.shortLabel, "");
      const base: HotelRoomTypeSetup = {
        id: toNonEmptyString(item.id, `room-type-${index + 1}`),
        name,
        rooms: Math.max(1, toPositiveInt(item.rooms, 1)),
        maxOccupancy: Math.max(1, toPositiveInt(item.maxOccupancy, 2)),
        baseRate: toPositiveRate(item.baseRate, 0),
        boardBasis: toNonEmptyString(item.boardBasis, "Room only"),
      };
      if (shortRaw.length > 0) {
        base.shortLabel = shortRaw.slice(0, 8);
      }
      return base;
    })
    .filter((item): item is HotelRoomTypeSetup => Boolean(item));
}

export function normalizePricingSetup(input: unknown): HotelPricingSetup {
  const source = isObject(input) ? input : {};

  return {
    currency: toNonEmptyString(source.currency, DEFAULT_PRICING_SETUP.currency)
      .slice(0, 8)
      .toUpperCase(),
    taxRate: toPercentage(source.taxRate, DEFAULT_PRICING_SETUP.taxRate),
    serviceChargeRate: toPercentage(
      source.serviceChargeRate,
      DEFAULT_PRICING_SETUP.serviceChargeRate,
    ),
    extraAdultRate: toPositiveRate(
      source.extraAdultRate,
      DEFAULT_PRICING_SETUP.extraAdultRate,
    ),
    extraChildRate: toPositiveRate(
      source.extraChildRate,
      DEFAULT_PRICING_SETUP.extraChildRate,
    ),
    checkInTime: toCheckInString(
      source.checkInTime,
      DEFAULT_PRICING_SETUP.checkInTime,
    ),
    checkOutTime: toTimeString(source.checkOutTime, DEFAULT_PRICING_SETUP.checkOutTime),
  };
}

export function isRoomPricingSetupComplete(
  roomTypes: HotelRoomTypeSetup[],
  signupRoomCount = 0,
) {
  if (
    roomTypes.length === 0 ||
    roomTypes.some((roomType) => roomType.rooms <= 0 || roomType.baseRate <= 0)
  ) {
    return false;
  }

  const configuredRooms = roomTypes.reduce((sum, roomType) => sum + roomType.rooms, 0);
  if (signupRoomCount > 0) {
    return configuredRooms >= signupRoomCount;
  }

  return configuredRooms > 0;
}

export function getRoomPricingSummary(roomTypes: HotelRoomTypeSetup[], fallbackRoomCount = 0) {
  const configuredRooms = roomTypes.reduce((sum, roomType) => sum + roomType.rooms, 0);
  const rates = roomTypes
    .map((roomType) => roomType.baseRate)
    .filter((value) => Number.isFinite(value) && value > 0);
  const totalRooms = Math.max(fallbackRoomCount, configuredRooms);
  const remainingRooms = Math.max(totalRooms - configuredRooms, 0);
  const excessRooms = fallbackRoomCount > 0 ? Math.max(configuredRooms - fallbackRoomCount, 0) : 0;

  return {
    roomTypeCount: roomTypes.length,
    configuredRooms,
    totalRooms,
    remainingRooms,
    excessRooms,
    lowestRate: rates.length ? Math.min(...rates) : null,
    highestRate: rates.length ? Math.max(...rates) : null,
  };
}

export function formatPricingAmount(amount: number | null, currency: string) {
  if (amount === null || !Number.isFinite(amount)) return "Not set";
  const normalizedCurrency = currency.trim().toUpperCase();
  const symbol = formatCurrencySymbol(normalizedCurrency);
  const spacer = /\p{L}/u.test(symbol) ? " " : "";

  try {
    const formattedAmount = new Intl.NumberFormat("en-NG", {
      maximumFractionDigits: 0,
    }).format(amount);

    if (symbol && symbol !== normalizedCurrency) {
      return `${symbol}${spacer}${formattedAmount}`;
    }

    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: normalizedCurrency,
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${symbol || normalizedCurrency}${spacer}${amount.toLocaleString("en-NG")}`;
  }
}

export function formatCurrencySymbol(currency: string) {
  if (!currency) return "";
  const normalizedCurrency = currency.trim().toUpperCase();
  const hardcodedSymbol = CURRENCY_SYMBOLS[normalizedCurrency];
  if (hardcodedSymbol) return hardcodedSymbol;

  try {
    const parts = new Intl.NumberFormat("en", {
      style: "currency",
      currency: normalizedCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);

    return parts.find((part) => part.type === "currency")?.value || normalizedCurrency;
  } catch {
    return normalizedCurrency;
  }
}

export function formatPricingTime(value: string) {
  if (!value) return "Not set";
  if (value === ANYTIME_CHECK_IN) return "Anytime";
  if (!isTimeString(value)) return value;

  const [hours, minutes] = value.split(":").map(Number);
  const sample = new Date(Date.UTC(2024, 0, 1, hours, minutes));

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(sample);
}
