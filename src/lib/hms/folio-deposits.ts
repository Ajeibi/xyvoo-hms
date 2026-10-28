import type { SupabaseClient } from "@supabase/supabase-js";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import {
  DEPOSIT_METHOD_LABEL,
  depositFor,
  depositStatus,
  policyFor,
  type DepositKind,
  type DepositMethod,
  type DepositPolicy,
  type DepositState,
} from "@/lib/hms/folio-deposits-shared";

export * from "@/lib/hms/folio-deposits-shared";

/*
 * Deposits: what a booking is asked to pay before arrival, taking that money, and moving it onto
 * the guest's bill at check-in. A deposit taken is held in Advance Guest Deposits (2300): money
 * the hotel holds for the guest, not revenue yet. At check-in it becomes a "deposit" payment on
 * the bill, and the night audit moves it out of 2300 against the Guest Ledger.
 */

/** Where the money from each way of paying lands in the books. */
const CASH_ACCOUNT: Record<DepositMethod, string> = { cash: "1000", card: "1020", pos: "1020", transfer: "1010" };
export const GUEST_DEPOSITS_ACCOUNT = "2300";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

async function accountIdByCode(supabase: SupabaseClient, tenantId: string, code: string) {
  const { data } = await supabase.schema("hotel").from("chart_of_accounts").select("id").eq("tenant_id", tenantId).eq("code", code).eq("is_active", true).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function listDepositPolicies(supabase: SupabaseClient, tenantId: string): Promise<DepositPolicy[]> {
  const { data } = await supabase
    .schema("hotel")
    .from("deposit_policies")
    .select("room_type_code,kind,value,due_days_before_arrival")
    .eq("tenant_id", tenantId);
  return (data ?? []).map((p) => ({
    roomTypeCode: (p.room_type_code as string | null) ?? null,
    kind: p.kind as DepositKind,
    value: Number(p.value) || 0,
    dueDaysBeforeArrival: Number(p.due_days_before_arrival) || 0,
  }));
}

/** Saves the default policy (roomTypeCode null) or one room type's, replacing what was there. */
export async function saveDepositPolicy(
  supabase: SupabaseClient,
  params: { tenantId: string; policy: DepositPolicy; userId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { policy } = params;
  if (policy.kind === "percent" && policy.value > 100) return { ok: false, error: "A percentage can't be more than 100." };
  if ((policy.kind === "fixed" || policy.kind === "percent") && !(policy.value > 0)) return { ok: false, error: "Enter an amount above zero." };

  let del = supabase.schema("hotel").from("deposit_policies").delete().eq("tenant_id", params.tenantId);
  del = policy.roomTypeCode ? del.eq("room_type_code", policy.roomTypeCode) : del.is("room_type_code", null);
  const { error: delError } = await del;
  if (delError) return { ok: false, error: delError.message };

  const { error } = await supabase.schema("hotel").from("deposit_policies").insert({
    tenant_id: params.tenantId,
    room_type_code: policy.roomTypeCode,
    kind: policy.kind,
    value: policy.kind === "none" || policy.kind === "first_night" ? 0 : roundMoney(policy.value),
    due_days_before_arrival: Math.max(0, Math.min(365, Math.round(policy.dueDaysBeforeArrival))),
    updated_by: params.userId,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Removes a room type's own policy, so it follows the hotel's default again. */
export async function removeDepositPolicy(supabase: SupabaseClient, tenantId: string, roomTypeCode: string) {
  const { error } = await supabase.schema("hotel").from("deposit_policies").delete().eq("tenant_id", tenantId).eq("room_type_code", roomTypeCode);
  return error ? { ok: false as const, error: error.message } : { ok: true as const };
}

export type DepositReservation = {
  id: string;
  room_type_code: string | null;
  arrival_at: string;
  created_at: string;
  nights: number;
  total_room_charges: number | string | null;
  pricing_snapshot: unknown;
  deposit_required: number | string | null;
  deposit_due_date: string | null;
};

export const DEPOSIT_RESERVATION_COLUMNS =
  "id,room_type_code,arrival_at,created_at,nights,total_room_charges,pricing_snapshot,deposit_required,deposit_due_date";

/** The whole stay with taxes, as priced when the booking was made. */
function stayTotalOf(r: Pick<DepositReservation, "pricing_snapshot" | "total_room_charges">) {
  const snap = (r.pricing_snapshot && typeof r.pricing_snapshot === "object" ? r.pricing_snapshot : {}) as { taxes?: { grandTotal?: number } };
  return Number(snap.taxes?.grandTotal) > 0 ? Number(snap.taxes!.grandTotal) : Number(r.total_room_charges) || 0;
}

/** What a booking would be asked for under today's policies. */
export function depositUnderPolicies(policies: DepositPolicy[], r: Omit<DepositReservation, "id" | "deposit_required" | "deposit_due_date">) {
  return depositFor(policyFor(policies, r.room_type_code), {
    stayTotal: stayTotalOf(r),
    nights: r.nights,
    arrivalDate: r.arrival_at.slice(0, 10),
    bookedOn: r.created_at.slice(0, 10),
  });
}

/** Records on a new booking the deposit it is asked for, so later policy changes don't move it. */
export async function snapshotDeposit(supabase: SupabaseClient, tenantId: string, reservationId: string) {
  const { data: r } = await supabase.schema("hotel").from("reservations").select(DEPOSIT_RESERVATION_COLUMNS).eq("tenant_id", tenantId).eq("id", reservationId).maybeSingle();
  if (!r) return;
  const { required, dueDate } = depositUnderPolicies(await listDepositPolicies(supabase, tenantId), r as DepositReservation);
  await supabase.schema("hotel").from("reservations").update({ deposit_required: required, deposit_due_date: dueDate }).eq("id", reservationId);
}

/** A booking's deposit: what it owes, by when, what has been paid, and each payment. */
export async function getDepositState(supabase: SupabaseClient, tenantId: string, r: DepositReservation): Promise<DepositState> {
  const [{ data: rows }, policies] = await Promise.all([
    supabase
      .schema("hotel")
      .from("reservation_deposits")
      .select("id,amount,method,reference,status,received_at,applied_at")
      .eq("tenant_id", tenantId)
      .eq("reservation_id", r.id)
      .order("received_at"),
    r.deposit_required == null ? listDepositPolicies(supabase, tenantId) : Promise.resolve([] as DepositPolicy[]),
  ]);
  const fromCurrentPolicy = r.deposit_required == null;
  const { required, dueDate } = fromCurrentPolicy
    ? depositUnderPolicies(policies, r)
    : { required: Number(r.deposit_required) || 0, dueDate: r.deposit_due_date };

  const payments = (rows ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount) || 0,
    method: p.method as DepositMethod,
    reference: (p.reference as string | null) ?? null,
    status: p.status as "held" | "applied" | "refunded",
    receivedAt: p.received_at as string,
    appliedAt: (p.applied_at as string | null) ?? null,
  }));
  const kept = payments.filter((p) => p.status !== "refunded");
  const paid = roundMoney(kept.reduce((s, p) => s + p.amount, 0));
  const held = roundMoney(kept.filter((p) => p.status === "held").reduce((s, p) => s + p.amount, 0));
  return {
    required,
    dueDate,
    paid,
    held,
    status: depositStatus(required, paid, dueDate, new Date().toISOString().slice(0, 10)),
    fromCurrentPolicy,
    payments,
  };
}

/**
 * Takes a deposit for a booking that hasn't arrived yet, and books it: the cash, card or bank
 * account against Advance Guest Deposits (2300).
 */
export async function recordDeposit(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; confirmationCode: string; amount: number; method: DepositMethod; reference?: string | null; userId: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const amount = roundMoney(params.amount);
  if (!(amount > 0)) return { ok: false, error: "Enter an amount above zero." };

  const [moneyAccount, depositsAccount] = await Promise.all([
    accountIdByCode(supabase, params.tenantId, CASH_ACCOUNT[params.method]),
    accountIdByCode(supabase, params.tenantId, GUEST_DEPOSITS_ACCOUNT),
  ]);
  if (!moneyAccount || !depositsAccount) {
    return { ok: false, error: `Add the ${CASH_ACCOUNT[params.method]} and Advance Guest Deposits (2300) accounts in Chart of accounts first.` };
  }

  const { data: row, error } = await supabase
    .schema("hotel")
    .from("reservation_deposits")
    .insert({
      tenant_id: params.tenantId,
      reservation_id: params.reservationId,
      amount,
      method: params.method,
      reference: params.reference?.trim() || null,
      received_by: params.userId,
    })
    .select("id")
    .single();
  if (error || !row) return { ok: false, error: error?.message ?? "The deposit couldn't be saved." };

  const posted = await postJournalEntry(supabase, {
    tenantId: params.tenantId,
    entryDate: new Date().toISOString().slice(0, 10),
    memo: `Deposit for booking ${params.confirmationCode} (${DEPOSIT_METHOD_LABEL[params.method].toLowerCase()})`,
    reference: row.id as string,
    createdBy: params.userId,
    lines: [
      { accountId: moneyAccount, department: "Front Desk", debit: amount, credit: 0 },
      { accountId: depositsAccount, department: "Front Desk", debit: 0, credit: amount },
    ],
  });
  if (!posted.ok) {
    // Never keep money the books don't show.
    await supabase.schema("hotel").from("reservation_deposits").delete().eq("id", row.id);
    return { ok: false, error: `The deposit couldn't be booked: ${posted.error}` };
  }
  await supabase.schema("hotel").from("reservation_deposits").update({ journal_entry_id: posted.id }).eq("id", row.id);
  return { ok: true, id: row.id as string };
}

/**
 * At check-in: puts each held deposit on the guest's bill as a "deposit" payment, and marks it
 * applied. The night audit then moves it out of Advance Guest Deposits against the Guest Ledger.
 */
export async function applyDepositsToFolio(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; userId: string; currency: string },
): Promise<{ applied: number; amount: number }> {
  const { data: held } = await supabase
    .schema("hotel")
    .from("reservation_deposits")
    .select("id,amount,method,received_at")
    .eq("tenant_id", params.tenantId)
    .eq("reservation_id", params.reservationId)
    .eq("status", "held");
  let applied = 0;
  let total = 0;
  for (const d of held ?? []) {
    // Claim the deposit first, so two check-ins at once can't both apply it.
    const { data: claimed } = await supabase
      .schema("hotel")
      .from("reservation_deposits")
      .update({ status: "applied", applied_at: new Date().toISOString() })
      .eq("id", d.id)
      .eq("status", "held")
      .select("id");
    if (!claimed?.length) continue;

    const method = d.method as DepositMethod;
    const day = new Date(d.received_at as string).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
    const { data: line, error } = await supabase
      .schema("hotel")
      .from("folio_transactions")
      .insert({
        tenant_id: params.tenantId,
        reservation_id: params.reservationId,
        kind: "payment",
        amount: -Math.abs(Number(d.amount)),
        method: "deposit",
        status: "posted",
        description: `Deposit paid ${day} (${DEPOSIT_METHOD_LABEL[method].toLowerCase()})`,
        department: null,
        posted_by: params.userId,
        reference: `deposit:${d.id}`,
        split_leg: "guest",
        currency_code: params.currency,
        metadata: { depositId: d.id, depositMethod: method },
      })
      .select("id")
      .single();
    if (error || !line) {
      await supabase.schema("hotel").from("reservation_deposits").update({ status: "held", applied_at: null }).eq("id", d.id);
      console.error("[deposits] not moved to the bill", error);
      continue;
    }
    await supabase.schema("hotel").from("reservation_deposits").update({ applied_folio_line_id: line.id }).eq("id", d.id);
    applied += 1;
    total += Number(d.amount);
  }
  return { applied, amount: roundMoney(total) };
}
