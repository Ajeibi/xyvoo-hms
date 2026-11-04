import {
  computeNigeriaHospitalityTaxes,
  type NigeriaHospitalityTaxBreakdown,
  type NigeriaTaxExemptions,
} from "@/lib/hms/nigeria-hospitality-taxes";
import type {
  NightPrice,
  NightSource,
  PriceRule,
  RateBook,
  RateIssue,
  RatePlan,
  RateRoomType,
  Restriction,
} from "@/lib/hms/rates/types";

/*
 * THE price function. Everything that needs "what does this room type cost on this plan for these
 * nights" calls priceStay (or quoteAllPlans / rateGrid, which are built on it). It never reads the
 * database: it is given a RateBook (see book.ts) so the screens, the booking routes, the website
 * engine and a channel manager all get the same answer.
 *
 * Dates are calendar days ("2026-12-24"). A stay is priced night by night: the night of the arrival
 * day up to the night before departure.
 */

const DAY_MS = 86_400_000;

export function isDay(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(day: string, days: number): string {
  return new Date(new Date(`${day}T12:00:00.000Z`).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((new Date(`${to}T12:00:00.000Z`).getTime() - new Date(`${from}T12:00:00.000Z`).getTime()) / DAY_MS);
}

export function dayOfWeek(day: string): number {
  return new Date(`${day}T12:00:00.000Z`).getUTCDay();
}

export function eachNight(arrival: string, departure: string): string[] {
  const n = Math.max(0, daysBetween(arrival, departure));
  return Array.from({ length: Math.min(n, 366) }, (_, i) => addDays(arrival, i));
}

function money(n: number) {
  return Math.round(n * 100) / 100;
}

function dayLabel(day: string) {
  return new Date(`${day}T12:00:00.000Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

function covers(rule: { dateFrom: string; dateTo: string; daysOfWeek: number[] | null }, day: string) {
  if (day < rule.dateFrom || day > rule.dateTo) return false;
  return !rule.daysOfWeek || rule.daysOfWeek.length === 0 || rule.daysOfWeek.includes(dayOfWeek(day));
}

/**
 * Which of two rules wins on a night: the higher priority, then the one for a named room type,
 * then the shorter date range (Christmas beats a year-long weekend rule), then the one for named days
 * of the week (a weekend rule inside a season beats the season), then the newer one.
 */
function moreSpecific(a: PriceRule, b: PriceRule): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const aType = a.roomTypeCode ? 1 : 0;
  const bType = b.roomTypeCode ? 1 : 0;
  if (aType !== bType) return bType - aType;
  const aSpan = daysBetween(a.dateFrom, a.dateTo);
  const bSpan = daysBetween(b.dateFrom, b.dateTo);
  if (aSpan !== bSpan) return aSpan - bSpan;
  const aDow = a.daysOfWeek && a.daysOfWeek.length > 0 ? 1 : 0;
  const bDow = b.daysOfWeek && b.daysOfWeek.length > 0 ? 1 : 0;
  if (aDow !== bDow) return bDow - aDow;
  return b.createdAt.localeCompare(a.createdAt);
}

export function winningRule(rules: PriceRule[], planId: string, roomTypeCode: string, day: string): PriceRule | null {
  let best: PriceRule | null = null;
  for (const r of rules) {
    if (r.ratePlanId !== planId) continue;
    if (r.roomTypeCode && r.roomTypeCode !== roomTypeCode) continue;
    if (!covers(r, day)) continue;
    if (!best || moreSpecific(r, best) < 0) best = r;
  }
  return best;
}

export function applyDerivation(price: number, plan: Pick<RatePlan, "deriveKind" | "deriveValue">): number {
  if (plan.deriveKind === "percent") return Math.max(0, money(price * (1 + plan.deriveValue / 100)));
  if (plan.deriveKind === "amount") return Math.max(0, money(price + plan.deriveValue));
  return price;
}

/** The room price (before extra people) of one plan, room type and night. */
export function nightBase(book: RateBook, plan: RatePlan, roomType: RateRoomType, day: string): { base: number; source: NightSource; label: string | null } {
  const seen = new Set<string>();
  const chain: RatePlan[] = [];
  let cursor: RatePlan | undefined = plan;
  while (cursor && !seen.has(cursor.id) && chain.length < 8) {
    seen.add(cursor.id);
    chain.push(cursor);
    cursor = cursor.parentPlanId ? book.plans.find((p) => p.id === cursor!.parentPlanId) : undefined;
  }
  // Walk up from the plan until something sets a price; then apply each derivation on the way back down.
  let found: { base: number; source: NightSource; label: string | null } | null = null;
  let depth = 0;
  for (; depth < chain.length; depth += 1) {
    const rule = winningRule(book.prices, chain[depth].id, roomType.id, day);
    if (rule) {
      found = { base: rule.price, source: depth === 0 ? "rule" : "derived", label: rule.label };
      break;
    }
  }
  if (!found) {
    found = { base: roomType.baseRate, source: chain.length > 1 ? "derived" : "base_rate", label: null };
    depth = chain.length;
  }
  let base = found.base;
  for (let i = depth - 1; i >= 0; i -= 1) base = applyDerivation(base, chain[i]);
  return { base: money(base), source: found.source, label: found.label };
}

/** Extra adults and children cost the same each night. Double occupancy is included when the room sleeps two or more. */
export function occupancySupplement(book: Pick<RateBook, "extraAdultRate" | "extraChildRate">, roomType: RateRoomType, adults: number, children: number): number {
  const included = roomType.maxOccupancy >= 2 ? 2 : 1;
  return money(Math.max(0, adults - included) * book.extraAdultRate + Math.max(0, children) * book.extraChildRate);
}

export type PriceStayInput = {
  roomTypeCode: string;
  /** Plan code or id. Leave out for the hotel's default plan. */
  plan?: string | null;
  arrivalDay: string;
  departureDay: string;
  adults: number;
  children?: number;
  /** The day the booking is made; defaults to today (UTC). Used for "book at least N days ahead". */
  bookedOn?: string;
  /** Where the booking comes from. Leave out to skip the channel check (staff pricing). */
  channel?: string | null;
  /** The company booking, for corporate plans. */
  arCustomerId?: string | null;
};

export type PriceStayResult =
  | {
      ok: true;
      plan: RatePlan;
      roomTypeCode: string;
      roomTypeName: string;
      nights: NightPrice[];
      nightlyAmounts: number[];
      roomTotal: number;
      averageRate: number;
      firstNightRate: number;
      /** Reasons the stay can't be sold as asked. Empty means it can. */
      issues: RateIssue[];
      bookable: boolean;
    }
  | { ok: false; error: string };

export function defaultPlan(book: RateBook): RatePlan | null {
  return book.plans.find((p) => p.isDefault && p.active) ?? book.plans.find((p) => p.active && !p.parentPlanId) ?? null;
}

/** A synthetic plan used before the hotel has any: priced straight from Settings. */
export const IMPLICIT_PLAN: RatePlan = {
  id: "implicit",
  code: "BAR",
  name: "Room only",
  description: null,
  parentPlanId: null,
  deriveKind: null,
  deriveValue: 0,
  boardBasis: "Room only",
  refundable: true,
  prepayRequired: false,
  roomTypeCodes: null,
  channels: ["front_desk", "website", "partner", "corporate"],
  arCustomerId: null,
  sellFrom: null,
  sellTo: null,
  isDefault: true,
  active: true,
  sortOrder: 0,
};

export function findPlan(book: RateBook, ref: string | null | undefined): RatePlan | null {
  if (!ref) return defaultPlan(book) ?? (book.plans.length === 0 ? IMPLICIT_PLAN : null);
  const lower = ref.toLowerCase();
  return book.plans.find((p) => p.id === ref || p.code.toLowerCase() === lower) ?? null;
}

/** Which restrictions of a given kind apply on a day, for a plan and room type. */
function restrictionsFor(book: RateBook, plan: RatePlan, roomTypeCode: string, day: string): Restriction[] {
  return book.restrictions.filter(
    (r) =>
      (!r.ratePlanId || r.ratePlanId === plan.id) &&
      (!r.roomTypeCode || r.roomTypeCode === roomTypeCode) &&
      covers(r, day),
  );
}

export function checkRestrictions(
  book: RateBook,
  plan: RatePlan,
  roomTypeCode: string,
  arrivalDay: string,
  departureDay: string,
  bookedOn: string,
): RateIssue[] {
  const issues: RateIssue[] = [];
  const nights = Math.max(0, daysBetween(arrivalDay, departureDay));

  // Closed applies to each night; the other rules follow the arrival day (closed to departure, the departure day).
  for (const night of eachNight(arrivalDay, departureDay)) {
    if (restrictionsFor(book, plan, roomTypeCode, night).some((r) => r.closed)) {
      issues.push({ kind: "closed", date: night, message: `${dayLabel(night)} is closed to sales on this plan.` });
      break;
    }
  }

  const onArrival = restrictionsFor(book, plan, roomTypeCode, arrivalDay);
  if (onArrival.some((r) => r.closedToArrival)) {
    issues.push({ kind: "closed_to_arrival", date: arrivalDay, message: `This plan can't start a stay on ${dayLabel(arrivalDay)}.` });
  }
  const minStay = onArrival.reduce((m, r) => Math.max(m, r.minStay ?? 0), 0);
  if (minStay > 0 && nights < minStay) {
    issues.push({ kind: "min_stay", date: arrivalDay, message: `Stays starting ${dayLabel(arrivalDay)} need at least ${minStay} night${minStay === 1 ? "" : "s"}.` });
  }
  const maxStays = onArrival.map((r) => r.maxStay).filter((n): n is number => n != null);
  if (maxStays.length > 0) {
    const maxStay = Math.min(...maxStays);
    if (nights > maxStay) {
      issues.push({ kind: "max_stay", date: arrivalDay, message: `Stays starting ${dayLabel(arrivalDay)} can be at most ${maxStay} night${maxStay === 1 ? "" : "s"}.` });
    }
  }
  const ahead = daysBetween(bookedOn, arrivalDay);
  const minAdvance = onArrival.reduce((m, r) => Math.max(m, r.minAdvanceDays ?? 0), 0);
  if (minAdvance > 0 && ahead < minAdvance) {
    issues.push({ kind: "min_advance", date: arrivalDay, message: `This plan must be booked at least ${minAdvance} day${minAdvance === 1 ? "" : "s"} before arrival.` });
  }
  const maxAdvances = onArrival.map((r) => r.maxAdvanceDays).filter((n): n is number => n != null);
  if (maxAdvances.length > 0) {
    const maxAdvance = Math.min(...maxAdvances);
    if (ahead > maxAdvance) {
      issues.push({ kind: "max_advance", date: arrivalDay, message: `This plan can't be booked more than ${maxAdvance} days ahead.` });
    }
  }

  if (restrictionsFor(book, plan, roomTypeCode, departureDay).some((r) => r.closedToDeparture)) {
    issues.push({ kind: "closed_to_departure", date: departureDay, message: `A stay can't end on ${dayLabel(departureDay)} on this plan.` });
  }
  return issues;
}

export function checkPlanEligibility(plan: RatePlan, input: Pick<PriceStayInput, "roomTypeCode" | "channel" | "arCustomerId">, bookedOn: string): RateIssue[] {
  const issues: RateIssue[] = [];
  if (!plan.active) issues.push({ kind: "plan_inactive", message: `${plan.name} isn't on sale.` });
  if ((plan.sellFrom && bookedOn < plan.sellFrom) || (plan.sellTo && bookedOn > plan.sellTo)) {
    issues.push({ kind: "plan_window", message: `${plan.name} can't be booked today.` });
  }
  if (plan.roomTypeCodes && plan.roomTypeCodes.length > 0 && !plan.roomTypeCodes.includes(input.roomTypeCode)) {
    issues.push({ kind: "plan_room_type", message: `${plan.name} isn't sold for this room type.` });
  }
  if (input.channel && plan.channels.length > 0 && !plan.channels.includes(input.channel)) {
    issues.push({ kind: "plan_channel", message: `${plan.name} isn't sold through this channel.` });
  }
  if (plan.arCustomerId && plan.arCustomerId !== (input.arCustomerId ?? null)) {
    issues.push({ kind: "plan_company", message: `${plan.name} is for one company's bookings only.` });
  }
  return issues;
}

export function priceStay(book: RateBook, input: PriceStayInput): PriceStayResult {
  const roomType = book.roomTypes.find((t) => t.id === input.roomTypeCode);
  if (!roomType) return { ok: false, error: "That room type isn't set up in your hotel settings." };
  if (!isDay(input.arrivalDay) || !isDay(input.departureDay)) return { ok: false, error: "Choose both dates." };
  if (input.departureDay <= input.arrivalDay) return { ok: false, error: "The guest must stay at least one night." };
  if (daysBetween(input.arrivalDay, input.departureDay) > 366) return { ok: false, error: "A stay can be at most 366 nights." };
  const plan = findPlan(book, input.plan);
  if (!plan) return { ok: false, error: input.plan ? "That rate plan wasn't found." : "No rate plan is on sale." };

  const adults = Math.max(1, Math.floor(input.adults) || 1);
  const children = Math.max(0, Math.floor(input.children ?? 0));
  const supplement = occupancySupplement(book, roomType, adults, children);
  const bookedOn = isDay(input.bookedOn) ? input.bookedOn : new Date().toISOString().slice(0, 10);

  const nights: NightPrice[] = eachNight(input.arrivalDay, input.departureDay).map((date) => {
    const n = nightBase(book, plan, roomType, date);
    return { date, base: n.base, supplement, total: money(n.base + supplement), source: n.source, label: n.label };
  });
  const roomTotal = money(nights.reduce((s, n) => s + n.total, 0));
  // The booking screens refuse a party bigger than the room allows, so the quote says so too
  // instead of pricing a stay that can't be booked.
  const occupancyIssues: RateIssue[] =
    adults + children > roomType.maxOccupancy
      ? [{ kind: "occupancy", message: `${roomType.name} sleeps at most ${roomType.maxOccupancy} guest${roomType.maxOccupancy === 1 ? "" : "s"}; this party is ${adults + children}.` }]
      : [];
  const issues = [
    ...occupancyIssues,
    ...checkPlanEligibility(plan, input, bookedOn),
    ...checkRestrictions(book, plan, roomType.id, input.arrivalDay, input.departureDay, bookedOn),
  ];
  return {
    ok: true,
    plan,
    roomTypeCode: roomType.id,
    roomTypeName: roomType.name,
    nights,
    nightlyAmounts: nights.map((n) => n.total),
    roomTotal,
    averageRate: money(roomTotal / nights.length),
    firstNightRate: nights[0]?.total ?? 0,
    issues,
    bookable: issues.length === 0,
  };
}

/** Every plan the room type could be sold on for these nights, cheapest first, each with its issues. */
export function quoteAllPlans(book: RateBook, input: Omit<PriceStayInput, "plan">, opts: { onlyBookable?: boolean } = {}) {
  const out: Extract<PriceStayResult, { ok: true }>[] = [];
  const plans = book.plans.length === 0 ? [IMPLICIT_PLAN] : book.plans.filter((p) => p.active);
  for (const plan of plans) {
    const r = priceStay(book, { ...input, plan: plan.id });
    if (!r.ok) continue;
    if (opts.onlyBookable && !r.bookable) continue;
    out.push(r);
  }
  return out.sort((a, b) => a.roomTotal - b.roomTotal || a.plan.sortOrder - b.plan.sortOrder);
}

/* ---------- Stay totals with taxes (same shape as walk-in pricing, but with a price per night) ---------- */

export type StayTotals = {
  nights: number;
  nightlyBar: number;
  nightlyAmounts: number[];
  roomSubtotalBeforeDiscount: number;
  roomDiscountAmount: number;
  roomSubtotalAfterDiscount: number;
  taxes: NigeriaHospitalityTaxBreakdown;
};

export function stayTotals(params: {
  nightly: number[];
  serviceChargeRate: number;
  taxRate: number;
  discountPercent?: number;
  exemptions?: NigeriaTaxExemptions;
}): StayTotals {
  const pct = Math.min(100, Math.max(0, params.discountPercent ?? 0));
  const nightlyAmounts = params.nightly.map((n) => money(n - money((n * pct) / 100)));
  const before = money(params.nightly.reduce((s, n) => s + n, 0));
  const after = money(nightlyAmounts.reduce((s, n) => s + n, 0));
  const taxes = computeNigeriaHospitalityTaxes({
    roomTaxableBase: after,
    serviceChargeRatePercent: params.serviceChargeRate,
    stateLevyRatePercent: params.taxRate,
    stampLevyAmount: 0,
    exemptions: params.exemptions ?? { exemptVat: false, exemptServiceCharge: false, exemptStateLevy: false, exemptStampLevy: false },
  });
  return {
    nights: params.nightly.length,
    nightlyBar: params.nightly.length > 0 ? money(before / params.nightly.length) : 0,
    nightlyAmounts,
    roomSubtotalBeforeDiscount: before,
    roomDiscountAmount: money(before - after),
    roomSubtotalAfterDiscount: after,
    taxes,
  };
}

/* ---------- The rates grid: one row per room type and plan, one cell per day ---------- */

export type GridCell = {
  date: string;
  /** The price for one night for the default party (no extra people). */
  price: number;
  source: NightSource;
  label: string | null;
  closed: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  minStay: number | null;
  maxStay: number | null;
};

export type GridRow = { roomTypeCode: string; roomTypeName: string; planId: string; planCode: string; planName: string; cells: GridCell[] };

export function rateGrid(book: RateBook, params: { fromDay: string; days: number; planRef?: string | null; roomTypeCode?: string | null }): GridRow[] {
  const plans = params.planRef ? [findPlan(book, params.planRef)].filter((p): p is RatePlan => Boolean(p)) : book.plans.length === 0 ? [IMPLICIT_PLAN] : book.plans.filter((p) => p.active);
  const types = book.roomTypes.filter((t) => !params.roomTypeCode || t.id === params.roomTypeCode);
  const days = Array.from({ length: Math.min(Math.max(1, params.days), 120) }, (_, i) => addDays(params.fromDay, i));
  const rows: GridRow[] = [];
  for (const plan of plans) {
    for (const t of types) {
      if (plan.roomTypeCodes && plan.roomTypeCodes.length > 0 && !plan.roomTypeCodes.includes(t.id)) continue;
      const cells = days.map((date): GridCell => {
        const n = nightBase(book, plan, t, date);
        const rs = restrictionsFor(book, plan, t.id, date);
        const mins = rs.map((r) => r.minStay).filter((x): x is number => x != null);
        const maxs = rs.map((r) => r.maxStay).filter((x): x is number => x != null);
        return {
          date,
          price: n.base,
          source: n.source,
          label: n.label,
          closed: rs.some((r) => r.closed),
          closedToArrival: rs.some((r) => r.closedToArrival),
          closedToDeparture: rs.some((r) => r.closedToDeparture),
          minStay: mins.length ? Math.max(...mins) : null,
          maxStay: maxs.length ? Math.min(...maxs) : null,
        };
      });
      rows.push({ roomTypeCode: t.id, roomTypeName: t.name, planId: plan.id, planCode: plan.code, planName: plan.name, cells });
    }
  }
  return rows;
}

/** A plan can't follow itself, directly or through other plans. */
export function wouldLoop(plans: Pick<RatePlan, "id" | "parentPlanId">[], planId: string, newParentId: string | null): boolean {
  let cursor = newParentId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === planId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = plans.find((p) => p.id === cursor)?.parentPlanId ?? null;
  }
  return false;
}
