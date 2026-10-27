import {
  EARLY_CHECKOUT_ADJUSTMENT_REF,
  computeEarlyCheckoutCredit,
  computeStayedNights,
  type FolioLineRow,
} from "@/lib/hms/folio";
import { EXTRA_NIGHT_REF_PREFIX, isExtraNightLine } from "@/lib/hms/folio-extra-nights";

/**
 * One plain-words picture of a stay's bill for the checkout screen: what was booked and at what
 * price, the discount given at check-in, extra nights, an early check-out credit (shown before
 * it is posted), extras, discounts given during the stay, payments, and what is left to pay.
 */

const DISCOUNT_SCOPE_LABEL: Record<string, string> = {
  all_nights: "every night",
  first_night: "the first night",
  last_night: "the last night",
  first_and_last: "the first and last nights",
};

const TAX_DESCRIPTION = /^(Service charge|State \/ local levy|VAT|Stamp)/i;

const DEPARTMENT_LABEL: Record<string, string> = {
  food_beverage: "Food and drink",
  housekeeping: "Housekeeping and laundry",
  guest_services: "Guest services",
  spa: "Spa",
  laundry: "Laundry",
  minibar: "Minibar",
  transport: "Transport",
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  pos: "Card machine",
  direct_bill: "Direct bill",
  split: "Split",
  transfer: "Bank transfer",
  paystack: "Paystack",
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function departmentLabel(department: string | null) {
  if (!department) return "Other";
  return DEPARTMENT_LABEL[department] ?? department.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export type StayReservation = {
  status: string;
  arrival_at?: string | null;
  departure_at: string;
  checked_in_at?: string | null;
  nights: number;
  rate_per_night: number | string | null;
  rate_overridden?: boolean | null;
  rate_override_reason?: string | null;
  pricing_snapshot: unknown;
};

export const STAY_RESERVATION_COLUMNS =
  "arrival_at,checked_in_at,rate_overridden,rate_override_reason";

type Snapshot = {
  nightlyBar?: number;
  discountPercent?: number;
  discountScope?: string;
  roomDiscountAmount?: number;
  roomSubtotalBeforeDiscount?: number;
};

export type StaySummary = {
  arrivalDate: string | null;
  departureDate: string;
  checkedInAt: string | null;
  bookedNights: number;
  /** Nights from check-in to now, the nights the guest will have stayed if they leave now. */
  nightsIfLeavingNow: number | null;
  nightlyRate: number;
  rateOverridden: boolean;
  rateOverrideReason: string | null;
  checkInDiscount: { percent: number; nightsLabel: string; amount: number } | null;
  booked: { room: number; taxes: number; total: number };
  extraNights: { nights: number; from: string | null; to: string | null; total: number };
  earlyCheckout: { unusedNights: number; credit: number; applied: boolean } | null;
  extras: { label: string; total: number; count: number }[];
  discounts: { id: string; description: string; amount: number; createdAt: string }[];
  payments: { id: string; description: string; method: string; amount: number; createdAt: string }[];
  refunds: { id: string; description: string; amount: number; createdAt: string }[];
  transfers: { id: string; description: string; amount: number }[];
  balance: number;
  /** Balance once the early check-out credit is taken off at checkout. */
  balanceAtCheckout: number;
};

export function buildStaySummary(
  reservation: StayReservation,
  lines: FolioLineRow[],
  now: Date = new Date(),
): StaySummary {
  const active = lines.filter((l) => !l.voided_at);
  const snap = (
    reservation.pricing_snapshot && typeof reservation.pricing_snapshot === "object" ? reservation.pricing_snapshot : {}
  ) as Snapshot;

  let bookedRoom = 0;
  let bookedTaxes = 0;
  const extraNightDates = new Set<string>();
  let extraTotal = 0;
  let earlyApplied = 0;
  const extrasByLabel = new Map<string, { total: number; count: number }>();
  const discounts: StaySummary["discounts"] = [];
  const payments: StaySummary["payments"] = [];
  const refunds: StaySummary["refunds"] = [];
  const transfers: StaySummary["transfers"] = [];

  for (const l of active) {
    if (isExtraNightLine(l)) {
      extraTotal += l.amount;
      if (l.reference?.endsWith(":room")) extraNightDates.add(l.reference.slice(EXTRA_NIGHT_REF_PREFIX.length, EXTRA_NIGHT_REF_PREFIX.length + 10));
      continue;
    }
    if (l.reference === EARLY_CHECKOUT_ADJUSTMENT_REF) {
      earlyApplied += -l.amount;
      continue;
    }
    if (l.kind === "charge" && l.method === "system" && l.department === "rooms") {
      const part = typeof l.metadata?.part === "string" ? l.metadata.part : null;
      const isTax = part ? part !== "room" : TAX_DESCRIPTION.test(l.description ?? "");
      if (isTax) bookedTaxes += l.amount;
      else bookedRoom += l.amount;
      continue;
    }
    if (l.kind === "charge") {
      const label = departmentLabel(l.department);
      const prev = extrasByLabel.get(label) ?? { total: 0, count: 0 };
      extrasByLabel.set(label, { total: prev.total + l.amount, count: prev.count + 1 });
      continue;
    }
    if (l.kind === "discount") {
      discounts.push({ id: l.id, description: l.description ?? "Discount", amount: -l.amount, createdAt: l.created_at });
      continue;
    }
    if (l.kind === "payment") {
      payments.push({
        id: l.id,
        description: l.description ?? "Payment",
        method: METHOD_LABEL[l.method] ?? l.method,
        amount: -l.amount,
        createdAt: l.created_at,
      });
      continue;
    }
    if (l.kind === "refund") {
      refunds.push({ id: l.id, description: l.description ?? "Refund", amount: -l.amount, createdAt: l.created_at });
      continue;
    }
    transfers.push({ id: l.id, description: l.description ?? "Transfer", amount: l.amount });
  }

  const balance = roundMoney(active.reduce((s, l) => s + l.amount, 0));
  const percent = Number(snap.discountPercent) || 0;
  const discountAmount = Number(snap.roomDiscountAmount) || 0;
  const checkInDiscount =
    percent > 0 && snap.discountScope && snap.discountScope !== "none"
      ? {
          percent,
          nightsLabel: DISCOUNT_SCOPE_LABEL[snap.discountScope] ?? snap.discountScope.replace(/_/g, " "),
          amount: roundMoney(discountAmount),
        }
      : null;

  let earlyCheckout: StaySummary["earlyCheckout"] = null;
  let nightsIfLeavingNow: number | null = null;
  if (reservation.checked_in_at) {
    nightsIfLeavingNow = computeStayedNights(reservation.checked_in_at, now);
    if (earlyApplied > 0) {
      earlyCheckout = { unusedNights: Math.max(0, reservation.nights - nightsIfLeavingNow), credit: roundMoney(earlyApplied), applied: true };
    } else if (reservation.status === "checked_in") {
      const preview = computeEarlyCheckoutCredit(lines, {
        bookedNights: reservation.nights,
        checkedInAt: reservation.checked_in_at,
        checkoutAt: now,
      });
      if (preview.creditAmount > 0) {
        earlyCheckout = { unusedNights: preview.unusedNights, credit: preview.creditAmount, applied: false };
      }
    }
  }

  const sortedNights = [...extraNightDates].sort();
  return {
    arrivalDate: reservation.arrival_at ?? null,
    departureDate: reservation.departure_at,
    checkedInAt: reservation.checked_in_at ?? null,
    bookedNights: Math.max(1, reservation.nights),
    nightsIfLeavingNow,
    nightlyRate: Number(snap.nightlyBar) > 0 ? Number(snap.nightlyBar) : Number(reservation.rate_per_night) || 0,
    rateOverridden: reservation.rate_overridden === true,
    rateOverrideReason: reservation.rate_override_reason ?? null,
    checkInDiscount,
    booked: { room: roundMoney(bookedRoom), taxes: roundMoney(bookedTaxes), total: roundMoney(bookedRoom + bookedTaxes) },
    extraNights: {
      nights: sortedNights.length,
      from: sortedNights[0] ?? null,
      to: sortedNights[sortedNights.length - 1] ?? null,
      total: roundMoney(extraTotal),
    },
    earlyCheckout,
    extras: [...extrasByLabel.entries()].map(([label, v]) => ({ label, total: roundMoney(v.total), count: v.count })),
    discounts,
    payments,
    refunds,
    transfers,
    balance,
    balanceAtCheckout: roundMoney(balance - (earlyCheckout && !earlyCheckout.applied ? earlyCheckout.credit : 0)),
  };
}
