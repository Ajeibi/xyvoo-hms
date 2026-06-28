import { createHash } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PaymentDisplayStatus } from "@/lib/hms/front-desk-board";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import type { WalkInRoomPricingResult } from "@/lib/hms/walk-in-pricing";
import { calendarNightsBetween } from "@/lib/hms/walk-in-pricing";

export const EARLY_CHECKOUT_ADJUSTMENT_REF = "early_checkout_adjustment";

export type FolioLineKind = "charge" | "payment" | "discount" | "refund" | "transfer";
export type FolioSplitLeg = "guest" | "company";

export type FolioLineRow = {
  id: string;
  tenant_id: string;
  reservation_id: string;
  amount: number;
  method: string;
  status: string;
  kind: FolioLineKind;
  description: string | null;
  department: string | null;
  reference: string | null;
  posted_by: string | null;
  voided_at: string | null;
  currency_code: string;
  fx_rate: number | null;
  original_amount: number | null;
  original_currency: string | null;
  split_leg: FolioSplitLeg;
  related_reservation_id: string | null;
  cash_float_session_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type FolioBalance = {
  charges: number;
  credits: number;
  balance: number;
  displayStatus: PaymentDisplayStatus;
  hasRefundPending: boolean;
};

export type FolioSummary = FolioBalance & {
  lines: FolioLineRow[];
  guestLegBalance: number;
  companyLegBalance: number;
};

function num(v: string | number | null | undefined) {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v) || 0;
}

export function mapFolioLineRow(row: Record<string, unknown>): FolioLineRow {
  return {
    id: row.id as string,
    tenant_id: row.tenant_id as string,
    reservation_id: row.reservation_id as string,
    amount: num(row.amount as string | number),
    method: row.method as string,
    status: row.status as string,
    kind: row.kind as FolioLineKind,
    description: (row.description as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    reference: (row.reference as string | null) ?? null,
    posted_by: (row.posted_by as string | null) ?? null,
    voided_at: (row.voided_at as string | null) ?? null,
    currency_code: (row.currency_code as string) ?? "NGN",
    fx_rate: row.fx_rate != null ? num(row.fx_rate as string | number) : null,
    original_amount:
      row.original_amount != null ? num(row.original_amount as string | number) : null,
    original_currency: (row.original_currency as string | null) ?? null,
    split_leg: (row.split_leg as FolioSplitLeg) ?? "guest",
    related_reservation_id: (row.related_reservation_id as string | null) ?? null,
    cash_float_session_id: (row.cash_float_session_id as string | null) ?? null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    created_at: row.created_at as string,
  };
}

/** Active lines only. Signed amounts: charges/discounts +, payments/refunds − */
export function computeFolioBalance(
  lines: FolioLineRow[],
  fallback?: {
    settlementMethod?: string;
    preauthAmount?: number | null;
    totalRoomCharges?: number;
    status?: string;
  },
): FolioBalance {
  const active = lines.filter((l) => !l.voided_at);
  const hasRefundPending = active.some(
    (l) => l.status === "refund_pending" || (l.kind === "refund" && l.status !== "posted"),
  );

  let charges = 0;
  let credits = 0;
  for (const l of active) {
    if (l.amount >= 0) charges += l.amount;
    else credits += Math.abs(l.amount);
  }
  const balance = active.reduce((sum, l) => sum + l.amount, 0);

  let displayStatus: PaymentDisplayStatus;
  if (hasRefundPending) {
    displayStatus = "refund_pending";
  } else if (active.length === 0 && fallback) {
    displayStatus = derivePaymentStatusHeuristic(fallback);
  } else if (balance <= 0 && charges > 0) {
    displayStatus = "paid";
  } else if (credits > 0 && balance > 0) {
    displayStatus = "partial";
  } else if (balance > 0) {
    displayStatus = "unpaid";
  } else if (charges === 0) {
    displayStatus = "unknown";
  } else {
    displayStatus = "paid";
  }

  return { charges, credits, balance, displayStatus, hasRefundPending };
}

function derivePaymentStatusHeuristic(fallback: {
  settlementMethod?: string;
  preauthAmount?: number | null;
  totalRoomCharges?: number;
  status?: string;
}): PaymentDisplayStatus {
  if (fallback.status === "cancelled") return "unknown";
  if (fallback.settlementMethod === "direct_bill") return "partial";
  if (fallback.settlementMethod === "cash" && fallback.status === "checked_in") return "unpaid";
  if (
    (fallback.settlementMethod === "card" ||
      fallback.settlementMethod === "pos" ||
      fallback.settlementMethod === "partial_credit") &&
    fallback.preauthAmount == null
  ) {
    return "unpaid";
  }
  if (fallback.status === "checked_in") return "unpaid";
  return "unknown";
}

export function computeLegBalance(lines: FolioLineRow[], leg: FolioSplitLeg) {
  return lines
    .filter((l) => !l.voided_at && l.split_leg === leg)
    .reduce((sum, l) => sum + l.amount, 0);
}

export async function fetchFolioLines(
  supabase: SupabaseClient,
  tenantId: string,
  reservationId: string,
): Promise<FolioLineRow[]> {
  const { data } = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .order("created_at", { ascending: true });
  return (data ?? []).map((r) => mapFolioLineRow(r as Record<string, unknown>));
}

export async function getFolioForReservation(
  supabase: SupabaseClient,
  tenantId: string,
  reservationId: string,
  fallback?: Parameters<typeof computeFolioBalance>[1],
): Promise<FolioSummary> {
  const lines = await fetchFolioLines(supabase, tenantId, reservationId);
  const balance = computeFolioBalance(lines, fallback);
  return {
    ...balance,
    lines,
    guestLegBalance: computeLegBalance(lines, "guest"),
    companyLegBalance: computeLegBalance(lines, "company"),
  };
}

export function hashManagerPin(pin: string) {
  return createHash("sha256").update(pin.trim()).digest("hex");
}

export async function verifyManagerPin(
  supabase: SupabaseClient,
  tenantId: string,
  pin: string | undefined,
  role: string,
): Promise<boolean> {
  if (isAdminLikeRole(role)) return true;
  if (!pin?.trim()) return false;
  const { data } = await supabase
    .schema("hotel")
    .from("tenant_folio_settings")
    .select("manager_pin_hash")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!data?.manager_pin_hash) return false;
  return data.manager_pin_hash === hashManagerPin(pin);
}

export async function getTenantFolioSettings(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("tenant_folio_settings")
    .select("allow_checkout_with_balance,large_charge_threshold,manager_pin_hash")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  return {
    allowCheckoutWithBalance: data?.allow_checkout_with_balance ?? false,
    largeChargeThreshold: num(data?.large_charge_threshold) || 50000,
    hasManagerPin: Boolean(data?.manager_pin_hash),
  };
}

export type InsertFolioLineInput = {
  tenantId: string;
  reservationId: string;
  kind: FolioLineKind;
  amount: number;
  method: string;
  description: string;
  department?: string;
  postedBy: string;
  reference?: string;
  status?: string;
  splitLeg?: FolioSplitLeg;
  currencyCode?: string;
  fxRate?: number;
  originalAmount?: number;
  originalCurrency?: string;
  relatedReservationId?: string;
  cashFloatSessionId?: string;
  metadata?: Record<string, unknown>;
};

export async function insertFolioLine(
  supabase: SupabaseClient,
  input: InsertFolioLineInput,
): Promise<{ line: FolioLineRow | null; error: string | null }> {
  const signedAmount =
    input.kind === "payment" || input.kind === "refund" || input.kind === "discount"
      ? -Math.abs(input.amount)
      : Math.abs(input.amount);

  const { data, error } = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .insert({
      tenant_id: input.tenantId,
      reservation_id: input.reservationId,
      kind: input.kind,
      amount: signedAmount,
      method: input.method,
      status: input.status ?? "posted",
      description: input.description,
      department: input.department ?? null,
      posted_by: input.postedBy,
      reference: input.reference ?? null,
      split_leg: input.splitLeg ?? "guest",
      currency_code: input.currencyCode ?? "NGN",
      fx_rate: input.fxRate ?? null,
      original_amount: input.originalAmount ?? null,
      original_currency: input.originalCurrency ?? null,
      related_reservation_id: input.relatedReservationId ?? null,
      cash_float_session_id: input.cashFloatSessionId ?? null,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error || !data) return { line: null, error: error?.message ?? "Insert failed" };
  return { line: mapFolioLineRow(data as Record<string, unknown>), error: null };
}

export async function postRoomChargeOnCheckIn(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    totalRoomCharges: number;
    nights: number;
    postedBy: string;
    currencyCode?: string;
  },
) {
  return insertFolioLine(supabase, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "charge",
    amount: params.totalRoomCharges,
    method: "system",
    description: `Room charges (${params.nights} night${params.nights === 1 ? "" : "s"})`,
    department: "rooms",
    postedBy: params.postedBy,
    currencyCode: params.currencyCode ?? "NGN",
  });
}

/** Posts room + Nigeria-modelled tax / levy folio lines at walk-in check-in. */
export async function postWalkInFolioBundle(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    nights: number;
    postedBy: string;
    currencyCode: string;
    pricing: WalkInRoomPricingResult;
    discountPercent: number;
    discountScope: string;
  },
) {
  const { nights, pricing, discountPercent, discountScope } = params;
  const { taxes, roomSubtotalAfterDiscount, roomDiscountAmount } = pricing;

  const scopeLabel = discountScope.replace(/_/g, " ");
  const roomDescription =
    roomDiscountAmount > 0
      ? `Room (${nights} night${nights === 1 ? "" : "s"}) — after ${discountPercent}% discount (${scopeLabel})`
      : `Room charges (${nights} night${nights === 1 ? "" : "s"})`;

  await insertFolioLine(supabase, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "charge",
    amount: roomSubtotalAfterDiscount,
    method: "system",
    description: roomDescription,
    department: "rooms",
    postedBy: params.postedBy,
    currencyCode: params.currencyCode,
  });

  if (taxes.serviceChargeAmount > 0) {
    await insertFolioLine(supabase, {
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      kind: "charge",
      amount: taxes.serviceChargeAmount,
      method: "system",
      description: `Service charge (${taxes.serviceChargeRatePercent}% of room)`,
      department: "rooms",
      postedBy: params.postedBy,
      currencyCode: params.currencyCode,
    });
  }

  if (taxes.stateLevyAmount > 0) {
    await insertFolioLine(supabase, {
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      kind: "charge",
      amount: taxes.stateLevyAmount,
      method: "system",
      description: `State / local levy (${taxes.stateLevyRatePercent}% of room — configure rate in settings)`,
      department: "rooms",
      postedBy: params.postedBy,
      currencyCode: params.currencyCode,
    });
  }

  if (taxes.vatAmount > 0) {
    await insertFolioLine(supabase, {
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      kind: "charge",
      amount: taxes.vatAmount,
      method: "system",
      description: `VAT (${taxes.vatRatePercent}% — Nigeria standard rate on taxable base)`,
      department: "rooms",
      postedBy: params.postedBy,
      currencyCode: params.currencyCode,
    });
  }

  if (taxes.stampLevyAmount > 0) {
    await insertFolioLine(supabase, {
      tenantId: params.tenantId,
      reservationId: params.reservationId,
      kind: "charge",
      amount: taxes.stampLevyAmount,
      method: "system",
      description: "Stamp / processing levy",
      department: "rooms",
      postedBy: params.postedBy,
      currencyCode: params.currencyCode,
    });
  }
}

/** Calendar nights from check-in date through checkout date (minimum 1). */
export function computeStayedNights(checkedInAt: string, checkoutAt: Date): number {
  const from = checkedInAt.slice(0, 10);
  const to = checkoutAt.toISOString().slice(0, 10);
  return calendarNightsBetween(from, to);
}

/**
 * Credits unused booked nights when a guest checks out before their scheduled departure.
 * Only adjusts system-posted room-stay charges (room + bundled taxes at check-in).
 */
export async function adjustFolioForEarlyCheckout(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    bookedNights: number;
    checkedInAt: string;
    checkoutAt: Date;
    postedBy: string;
    currencyCode?: string;
  },
): Promise<{ adjusted: boolean; unusedNights: number; creditAmount: number; actualNights: number }> {
  const bookedNights = Math.max(1, params.bookedNights);
  const actualNights = computeStayedNights(params.checkedInAt, params.checkoutAt);
  const unusedNights = bookedNights - actualNights;

  if (unusedNights <= 0) {
    return { adjusted: false, unusedNights: 0, creditAmount: 0, actualNights };
  }

  const lines = await fetchFolioLines(supabase, params.tenantId, params.reservationId);
  const active = lines.filter((l) => !l.voided_at);

  if (active.some((l) => l.reference === EARLY_CHECKOUT_ADJUSTMENT_REF)) {
    return { adjusted: false, unusedNights, creditAmount: 0, actualNights };
  }

  const stayCharges = active.filter(
    (l) => l.kind === "charge" && l.method === "system" && l.department === "rooms",
  );
  if (stayCharges.length === 0) {
    return { adjusted: false, unusedNights, creditAmount: 0, actualNights };
  }

  const currentStayTotal = stayCharges.reduce((s, l) => s + l.amount, 0);
  const ratio = actualNights / bookedNights;
  const targetTotal = Math.round(currentStayTotal * ratio * 100) / 100;
  const creditAmount = Math.round((currentStayTotal - targetTotal) * 100) / 100;

  if (creditAmount < 0.01) {
    return { adjusted: false, unusedNights, creditAmount: 0, actualNights };
  }

  const { error } = await insertFolioLine(supabase, {
    tenantId: params.tenantId,
    reservationId: params.reservationId,
    kind: "discount",
    amount: creditAmount,
    method: "system",
    description: `Early checkout — ${unusedNights} unused night${unusedNights === 1 ? "" : "s"} credited`,
    department: "rooms",
    postedBy: params.postedBy,
    reference: EARLY_CHECKOUT_ADJUSTMENT_REF,
    currencyCode: params.currencyCode ?? "NGN",
    metadata: {
      bookedNights,
      actualNights,
      unusedNights,
    },
  });

  if (error) {
    return { adjusted: false, unusedNights, creditAmount: 0, actualNights };
  }

  return { adjusted: true, unusedNights, creditAmount, actualNights };
}

export async function getActiveCashFloatSession(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("cash_float_sessions")
    .select("*")
    .eq("tenant_id", tenantId)
    .is("closed_at", null)
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function openCashFloatSession(
  supabase: SupabaseClient,
  params: { tenantId: string; openedBy: string; openingBalance: number },
) {
  const { data, error } = await supabase
    .schema("hotel")
    .from("cash_float_sessions")
    .insert({
      tenant_id: params.tenantId,
      opened_by: params.openedBy,
      opening_balance: params.openingBalance,
    })
    .select("*")
    .single();
  if (error) return { session: null as Record<string, unknown> | null, error: error.message };
  return { session: data as Record<string, unknown>, error: null as string | null };
}

/** Returns the active session, opening one with zero opening balance if the shift has none yet. */
export async function ensureActiveCashFloatSession(
  supabase: SupabaseClient,
  tenantId: string,
  openedBy: string,
) {
  const existing = await getActiveCashFloatSession(supabase, tenantId);
  if (existing) return { session: existing, created: false };
  const { session, error } = await openCashFloatSession(supabase, {
    tenantId,
    openedBy,
    openingBalance: 0,
  });
  if (!session) return { session: null, created: false, error: error ?? "Could not open cash float." };
  return { session, created: true, error: null };
}
