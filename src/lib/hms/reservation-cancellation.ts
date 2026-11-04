import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog, emitNotification } from "@/lib/hms/front-desk-ops";
import { settleDeposit } from "@/lib/hms/folio-refunds";
import type { RefundMethod } from "@/lib/hms/folio-refunds";
import { matchWaitlistForOpening } from "@/lib/hms/waitlist";
import {
  cancellationPolicyFor,
  DEFAULT_CANCELLATION_POLICY,
  FEE_KINDS,
  money,
  policyFromSnapshot,
  quoteCancellation,
  type CancellationPolicy,
  type CancellationQuote,
  type FeeKind,
} from "@/lib/hms/reservation-cancellation-shared";

export * from "@/lib/hms/reservation-cancellation-shared";

/* ---------------- Policies ---------------- */

export async function listCancellationPolicies(db: SupabaseClient, tenantId: string): Promise<CancellationPolicy[]> {
  const { data } = await db
    .schema("hotel")
    .from("cancellation_policies")
    .select("room_type_code,name,free_days_before_arrival,late_fee_kind,late_fee_value,no_show_fee_kind,no_show_fee_value")
    .eq("tenant_id", tenantId);
  return (data ?? []).map((r) => ({
    roomTypeCode: (r.room_type_code as string | null) ?? null,
    name: (r.name as string) || "Standard",
    freeDaysBeforeArrival: Number(r.free_days_before_arrival) || 0,
    lateFeeKind: r.late_fee_kind as FeeKind,
    lateFeeValue: Number(r.late_fee_value) || 0,
    noShowFeeKind: r.no_show_fee_kind as FeeKind,
    noShowFeeValue: Number(r.no_show_fee_value) || 0,
  }));
}

export async function saveCancellationPolicy(
  db: SupabaseClient,
  params: { tenantId: string; userId: string; policy: CancellationPolicy },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = params.policy;
  if (!(FEE_KINDS as readonly string[]).includes(p.lateFeeKind) || !(FEE_KINDS as readonly string[]).includes(p.noShowFeeKind)) {
    return { ok: false, error: "Choose a fee type." };
  }
  if (p.lateFeeKind === "percent" && p.lateFeeValue > 100) return { ok: false, error: "A percentage can't be above 100." };
  if (p.noShowFeeKind === "percent" && p.noShowFeeValue > 100) return { ok: false, error: "A percentage can't be above 100." };

  const row = {
    tenant_id: params.tenantId,
    room_type_code: p.roomTypeCode,
    name: p.name.trim() || "Standard",
    free_days_before_arrival: Math.round(p.freeDaysBeforeArrival),
    late_fee_kind: p.lateFeeKind,
    late_fee_value: p.lateFeeKind === "percent" || p.lateFeeKind === "fixed" ? p.lateFeeValue : 0,
    no_show_fee_kind: p.noShowFeeKind,
    no_show_fee_value: p.noShowFeeKind === "percent" || p.noShowFeeKind === "fixed" ? p.noShowFeeValue : 0,
    updated_by: params.userId,
    updated_at: new Date().toISOString(),
  };
  // The unique index is on an expression, so update the existing row if there is one, else insert.
  let q = db.schema("hotel").from("cancellation_policies").select("id").eq("tenant_id", params.tenantId);
  q = p.roomTypeCode ? q.eq("room_type_code", p.roomTypeCode) : q.is("room_type_code", null);
  const { data: existing } = await q.maybeSingle();
  const { error } = existing
    ? await db.schema("hotel").from("cancellation_policies").update(row).eq("id", existing.id as string)
    : await db.schema("hotel").from("cancellation_policies").insert(row);
  if (error) return { ok: false, error: "The policy couldn't be saved." };
  return { ok: true };
}

export async function removeCancellationPolicy(db: SupabaseClient, tenantId: string, roomTypeCode: string) {
  await db.schema("hotel").from("cancellation_policies").delete().eq("tenant_id", tenantId).eq("room_type_code", roomTypeCode);
  return { ok: true as const };
}

/** Records on a new booking the policy it was made under, so later rule changes never move it. */
export async function snapshotCancellationPolicy(db: SupabaseClient, tenantId: string, reservationId: string, roomTypeCode: string) {
  const policy = cancellationPolicyFor(await listCancellationPolicies(db, tenantId), roomTypeCode);
  await db.schema("hotel").from("reservations").update({ cancellation_policy: policy }).eq("tenant_id", tenantId).eq("id", reservationId);
  return policy;
}

/* ---------------- Cancelling ---------------- */

const CANCEL_COLUMNS =
  "id,confirmation_code,status,arrival_at,departure_at,nights,room_type_code,room_unit_id,total_room_charges,pricing_snapshot,cancellation_policy,deposit_required,allotment_id";

type CancelRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  room_type_code: string;
  room_unit_id: string | null;
  total_room_charges: number | string | null;
  pricing_snapshot: unknown;
  cancellation_policy: unknown;
};

function stayTotalOf(r: Pick<CancelRow, "pricing_snapshot" | "total_room_charges">) {
  const snap = (r.pricing_snapshot && typeof r.pricing_snapshot === "object" ? r.pricing_snapshot : {}) as { taxes?: { grandTotal?: number } };
  return Number(snap.taxes?.grandTotal) > 0 ? Number(snap.taxes!.grandTotal) : Number(r.total_room_charges) || 0;
}

export type HeldDeposit = { id: string; amount: number; method: string; receivedAt: string };

export async function heldDeposits(db: SupabaseClient, tenantId: string, reservationId: string): Promise<HeldDeposit[]> {
  const { data } = await db
    .schema("hotel")
    .from("reservation_deposits")
    .select("id,amount,method,received_at")
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .eq("status", "held")
    .order("received_at");
  return (data ?? []).map((d) => ({ id: d.id as string, amount: Number(d.amount) || 0, method: d.method as string, receivedAt: d.received_at as string }));
}

export type CancellationPreview = {
  confirmationCode: string;
  status: string;
  policy: CancellationPolicy;
  policyFromBooking: boolean;
  quote: CancellationQuote;
  stayTotal: number;
  deposits: HeldDeposit[];
  depositsTotal: number;
};

/** What cancelling this booking now would cost, under the policy it was made with. */
export async function previewCancellation(
  db: SupabaseClient,
  params: { tenantId: string; reservationId: string; today: string },
): Promise<{ ok: true; preview: CancellationPreview } | { ok: false; error: string }> {
  const { data } = await db.schema("hotel").from("reservations").select(CANCEL_COLUMNS).eq("tenant_id", params.tenantId).eq("id", params.reservationId).maybeSingle();
  if (!data) return { ok: false, error: "Booking not found." };
  const r = data as unknown as CancelRow;
  if (r.status !== "confirmed") return { ok: false, error: "Only a booking that hasn't arrived can be cancelled." };

  const own = policyFromSnapshot(r.cancellation_policy);
  const policy = own ?? cancellationPolicyFor(await listCancellationPolicies(db, params.tenantId), r.room_type_code) ?? DEFAULT_CANCELLATION_POLICY;
  const stayTotal = stayTotalOf(r);
  const quote = quoteCancellation(policy, { arrivalDay: r.arrival_at.slice(0, 10), today: params.today, stayTotal, nights: Math.max(1, Number(r.nights) || 1) });
  const deposits = await heldDeposits(db, params.tenantId, r.id);
  return {
    ok: true,
    preview: {
      confirmationCode: r.confirmation_code,
      status: r.status,
      policy,
      policyFromBooking: Boolean(own),
      quote,
      stayTotal,
      deposits,
      depositsTotal: money(deposits.reduce((s, d) => s + d.amount, 0)),
    },
  };
}

export type DepositDecision = { depositId: string; action: "keep" | "refund"; method?: RefundMethod; posReference?: string };

export type CancelResult =
  | { ok: true; fee: number; feeStatus: "none" | "kept_from_deposit" | "owed" | "waived"; depositErrors: string[] }
  | { ok: false; error: string };

/**
 * Cancels a booking that hasn't arrived: frees the room and the stock, records the reason and the
 * fee the policy asks for (or that a manager waived), and settles held deposits the way staff chose
 * (refund, or keep as the cancellation fee, through the same functions the deposit card uses).
 */
export async function cancelReservation(
  db: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    userId: string;
    today: string;
    reason: string;
    waiveFee?: boolean;
    depositDecisions?: DepositDecision[];
  },
): Promise<CancelResult> {
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: "Say why the booking is being cancelled." };

  const previewed = await previewCancellation(db, { tenantId: params.tenantId, reservationId: params.reservationId, today: params.today });
  if (!previewed.ok) return previewed;
  const { preview } = previewed;

  const fee = params.waiveFee ? 0 : preview.quote.fee;
  const keptDeposits = (params.depositDecisions ?? []).filter((d) => d.action === "keep");
  const keptTotal = money(preview.deposits.filter((d) => keptDeposits.some((k) => k.depositId === d.id)).reduce((s, d) => s + d.amount, 0));
  const feeStatus: "none" | "kept_from_deposit" | "owed" | "waived" = params.waiveFee && preview.quote.fee > 0
    ? "waived"
    : fee <= 0
      ? "none"
      : keptTotal + 0.005 >= fee
        ? "kept_from_deposit"
        : "owed";

  const { data: row } = await db.schema("hotel").from("reservations").select("room_unit_id,room_type_code,arrival_at,departure_at").eq("tenant_id", params.tenantId).eq("id", params.reservationId).maybeSingle();

  const { data: updated, error } = await db
    .schema("hotel")
    .from("reservations")
    .update({
      status: "cancelled",
      room_unit_id: null,
      cancel_reason: reason,
      cancelled_by: params.userId,
      cancellation_fee: fee,
      cancellation_fee_status: feeStatus,
      cancellation_policy: preview.policy,
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .eq("status", "confirmed")
    .select("id");
  if (error || !updated?.length) return { ok: false, error: "The booking couldn't be cancelled. It may already have changed." };

  const depositErrors: string[] = [];
  for (const d of params.depositDecisions ?? []) {
    const result = await settleDeposit(db, {
      tenantId: params.tenantId,
      depositId: d.depositId,
      action: d.action,
      method: d.method,
      posReference: d.posReference,
      reason: d.action === "keep" ? `Cancellation fee: ${reason}` : `Booking cancelled: ${reason}`,
      userId: params.userId,
    });
    if (!result.ok) depositErrors.push(result.error);
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.userId,
    action: "reservation_cancelled",
    entityType: "reservation",
    entityId: params.reservationId,
    before: { status: "confirmed", room_unit_id: row?.room_unit_id ?? null },
    after: { status: "cancelled", reason, fee, feeStatus, policy: preview.policy.name, waived: params.waiveFee ? preview.quote.fee : 0 },
  });

  if (row) {
    try {
      await matchWaitlistForOpening(db, params.tenantId, {
        roomTypeCode: row.room_type_code as string,
        arrivalAt: row.arrival_at as string,
        departureAt: row.departure_at as string,
      });
    } catch (e) {
      console.warn("[cancelReservation] waitlist match failed", e);
    }
  }

  if (fee > 0 && feeStatus === "owed") {
    await emitNotification({
      tenantId: params.tenantId,
      type: "reservation_cancelled",
      title: "Cancellation fee owed",
      body: `${preview.confirmationCode} was cancelled late. The fee under the policy is ${fee.toLocaleString("en-NG")}, and no deposit covers it.`,
      severity: "warning",
      entityType: "reservation",
      entityId: params.reservationId,
    }).catch(() => undefined);
  }

  return { ok: true, fee, feeStatus, depositErrors };
}
