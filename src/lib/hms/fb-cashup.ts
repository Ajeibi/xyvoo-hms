import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import {
  cashUpJournalLines,
  FB_CASHUP_ACCOUNT_NAMES,
  FB_CASHUP_ACCOUNTS,
  outletDepartment,
  tipPayoutJournalLines,
  type ZReport,
  zReport,
} from "@/lib/hms/fb-cashup-rules";
import { postJournalEntry } from "@/lib/hms/journal-entries";
import { getTenantFbSettings } from "@/lib/hms/fb-settings";

export type FbCashSession = {
  id: string;
  outletId: string;
  outletName: string;
  outletType: string | null;
  status: "open" | "closed";
  openingFloat: number;
  openedBy: string | null;
  openedAt: string;
  countedCash: number | null;
  expectedCash: number | null;
  variance: number | null;
  cashTaken: number | null;
  cashTips: number | null;
  cardTaken: number | null;
  cardTips: number | null;
  cashTipsPaidOut: number | null;
  bookedCashTips: number | null;
  bookedCardTips: number | null;
  varianceReason: string | null;
  notes: string | null;
  closedBy: string | null;
  closedAt: string | null;
  approvedByManager: boolean;
  journalEntryId: string | null;
  postingError: string | null;
};

/** posting_error while a post is in flight (plain text so it is safe in a filter). */
export const FB_CASHUP_POSTING = "posting";
const POSTING = FB_CASHUP_POSTING;

const numOrNull = (v: unknown) => (v == null ? null : Number(v));

function mapSession(r: Record<string, unknown>, outlets: Map<string, { name: string; type: string | null }>): FbCashSession {
  const outlet = outlets.get(r.outlet_id as string);
  return {
    id: r.id as string,
    outletId: r.outlet_id as string,
    outletName: outlet?.name ?? "Removed outlet",
    outletType: outlet?.type ?? null,
    status: r.status as FbCashSession["status"],
    openingFloat: Number(r.opening_float) || 0,
    openedBy: (r.opened_by as string) ?? null,
    openedAt: r.opened_at as string,
    countedCash: numOrNull(r.counted_cash),
    expectedCash: numOrNull(r.expected_cash),
    variance: numOrNull(r.variance),
    cashTaken: numOrNull(r.cash_taken),
    cashTips: numOrNull(r.cash_tips),
    cardTaken: numOrNull(r.card_taken),
    cardTips: numOrNull(r.card_tips),
    cashTipsPaidOut: numOrNull(r.cash_tips_paid_out),
    bookedCashTips: numOrNull(r.booked_cash_tips),
    bookedCardTips: numOrNull(r.booked_card_tips),
    varianceReason: (r.variance_reason as string) ?? null,
    notes: (r.notes as string) ?? null,
    closedBy: (r.closed_by as string) ?? null,
    closedAt: (r.closed_at as string) ?? null,
    approvedByManager: r.approved_by_manager === true,
    journalEntryId: (r.journal_entry_id as string) ?? null,
    postingError: (r.posting_error as string) ?? null,
  };
}

async function outletMap(supabase: SupabaseClient, tenantId: string) {
  const { data } = await supabase.schema("hotel").from("fb_outlets").select("id,name,outlet_type").eq("tenant_id", tenantId);
  return new Map((data ?? []).map((o) => [o.id as string, { name: o.name as string, type: (o.outlet_type as string) ?? null }]));
}

/** Open tills, and the most recent closed ones (newest first). */
export async function loadCashSessions(supabase: SupabaseClient, tenantId: string, limit = 30) {
  const [outlets, { data }] = await Promise.all([
    outletMap(supabase, tenantId),
    supabase
      .schema("hotel")
      .from("fb_cash_sessions")
      .select("*")
      .eq("tenant_id", tenantId)
      .order("opened_at", { ascending: false })
      .limit(limit),
  ]);
  return (data ?? []).map((r) => mapSession(r as Record<string, unknown>, outlets));
}

export async function loadCashSession(supabase: SupabaseClient, tenantId: string, sessionId: string) {
  const [outlets, { data }] = await Promise.all([
    outletMap(supabase, tenantId),
    supabase.schema("hotel").from("fb_cash_sessions").select("*").eq("id", sessionId).eq("tenant_id", tenantId).maybeSingle(),
  ]);
  return data ? mapSession(data as Record<string, unknown>, outlets) : null;
}

/** The till open for this outlet right now, if any. */
export async function openSessionIdForOutlet(supabase: SupabaseClient, tenantId: string, outletId: string) {
  const { data } = await supabase
    .schema("hotel")
    .from("fb_cash_sessions")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("outlet_id", outletId)
    .eq("status", "open")
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Ties a payment to the till open for the bill's outlet, so it counts in that cash-up. */
export async function linkPaymentToOpenTill(
  supabase: SupabaseClient,
  tenantId: string,
  paymentId: string,
  outletId: string,
) {
  const sessionId = await openSessionIdForOutlet(supabase, tenantId, outletId);
  if (!sessionId) return null;
  await supabase
    .schema("hotel")
    .from("fb_order_payments")
    .update({ cash_session_id: sessionId })
    .eq("id", paymentId)
    .eq("tenant_id", tenantId)
    .is("cash_session_id", null);
  return sessionId;
}

export async function openCashSession(
  supabase: SupabaseClient,
  params: { tenantId: string; outletId: string; openingFloat: number; openedBy: string },
) {
  const { data: outlet } = await supabase
    .schema("hotel")
    .from("fb_outlets")
    .select("id,is_active")
    .eq("id", params.outletId)
    .eq("tenant_id", params.tenantId)
    .maybeSingle();
  if (!outlet) return { session: null, error: "That outlet no longer exists." };
  const { data, error } = await supabase
    .schema("hotel")
    .from("fb_cash_sessions")
    .insert({
      tenant_id: params.tenantId,
      outlet_id: params.outletId,
      opening_float: Math.round(params.openingFloat * 100) / 100,
      opened_by: params.openedBy,
    })
    .select("id")
    .single();
  if (error) {
    return {
      session: null,
      error: error.code === "23505" ? "A till is already open for this outlet. Close it first." : error.message,
    };
  }
  return { session: await loadCashSession(supabase, params.tenantId, data.id as string), error: null };
}

/** The hotel's calendar date for a moment, in its time zone (for the journal entry date). */
function hotelDate(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

async function cashUpAccounts(supabase: SupabaseClient, tenantId: string) {
  const keys = Object.keys(FB_CASHUP_ACCOUNTS) as (keyof typeof FB_CASHUP_ACCOUNTS)[];
  const ids = await Promise.all(keys.map((k) => getAccountIdByCode(supabase, tenantId, FB_CASHUP_ACCOUNTS[k])));
  const missing = keys.filter((_, i) => !ids[i]).map((k) => FB_CASHUP_ACCOUNT_NAMES[k]);
  if (missing.length) return { accounts: null, error: `Missing accounts in the chart of accounts: ${missing.join(", ")}.` };
  return {
    accounts: Object.fromEntries(keys.map((k, i) => [k, ids[i] as string])) as Record<keyof typeof FB_CASHUP_ACCOUNTS, string>,
    error: null,
  };
}

/**
 * Books a closed cash-up's tips and over/short. Safe to call again: it only
 * posts when nothing has been posted yet, and claims the session first so
 * two clicks can't post twice. A failure is kept on the session for a retry.
 */
export async function postCashUpJournal(supabase: SupabaseClient, tenantId: string, sessionId: string, actor: string) {
  const session = await loadCashSession(supabase, tenantId, sessionId);
  if (!session) return { journalEntryId: null, error: "Cash-up not found." };
  if (session.status !== "closed") return { journalEntryId: null, error: "Close the till before posting it." };
  if (session.journalEntryId) return { journalEntryId: session.journalEntryId, error: null };

  const { data: claimed } = await supabase
    .schema("hotel")
    .from("fb_cash_sessions")
    .update({ posting_error: POSTING })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .is("journal_entry_id", null)
    .or(`posting_error.is.null,posting_error.neq.${POSTING}`)
    .select("id");
  if (!claimed?.length) return { journalEntryId: null, error: "This cash-up is already being posted." };

  const fail = async (error: string) => {
    await supabase.schema("hotel").from("fb_cash_sessions").update({ posting_error: error }).eq("id", sessionId);
    return { journalEntryId: null, error };
  };

  const { accounts, error: accountError } = await cashUpAccounts(supabase, tenantId);
  if (!accounts) return fail(accountError ?? "Accounts missing.");

  const lines = cashUpJournalLines(
    { cashTips: session.bookedCashTips ?? 0, cardTips: session.bookedCardTips ?? 0, variance: session.variance ?? 0 },
    accounts,
    outletDepartment(session.outletType),
  );
  if (!lines.length) {
    // Exact till and no tips: nothing to book.
    await supabase.schema("hotel").from("fb_cash_sessions").update({ posting_error: null }).eq("id", sessionId);
    return { journalEntryId: null, error: null };
  }

  const settings = await getTenantFbSettings(supabase, tenantId);
  const posted = await postJournalEntry(supabase, {
    tenantId,
    entryDate: hotelDate(new Date(session.closedAt ?? Date.now()), settings.timeZone),
    memo: `${session.outletName} cash-up: tips and cash over/short`,
    reference: `FB-CASHUP-${sessionId.slice(0, 8)}`,
    createdBy: actor,
    lines,
  });
  if (!posted.ok) return fail(posted.error);

  await supabase
    .schema("hotel")
    .from("fb_cash_sessions")
    .update({ journal_entry_id: posted.id, posting_error: null })
    .eq("id", sessionId);
  return { journalEntryId: posted.id, error: null };
}

export async function closeCashSession(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    sessionId: string;
    counted: number;
    varianceReason?: string | null;
    notes?: string | null;
    closedBy: string;
    managerApproved: boolean;
  },
) {
  const { error } = await supabase.schema("hotel").rpc("fb_close_cash_session", {
    p_tenant_id: params.tenantId,
    p_session_id: params.sessionId,
    p_counted: params.counted,
    p_variance_reason: params.varianceReason ?? null,
    p_notes: params.notes ?? null,
    p_closed_by: params.closedBy,
    p_manager_approved: params.managerApproved,
  });
  if (error) return { session: null, posting: null, error: error.message };
  const posting = await postCashUpJournal(supabase, params.tenantId, params.sessionId, params.closedBy);
  return { session: await loadCashSession(supabase, params.tenantId, params.sessionId), posting, error: null };
}

/**
 * What the till should hold right now, before counting: worked out the same
 * way as at close, so a manager can see it (staff count blind).
 */
export async function liveExpectedCash(supabase: SupabaseClient, tenantId: string, session: FbCashSession) {
  const [{ data: payments }, { data: payouts }] = await Promise.all([
    supabase
      .schema("hotel")
      .from("fb_order_payments")
      .select("method,amount,tip_amount")
      .eq("tenant_id", tenantId)
      .eq("cash_session_id", session.id),
    supabase
      .schema("hotel")
      .from("fb_tip_payouts")
      .select("amount")
      .eq("tenant_id", tenantId)
      .eq("cash_session_id", session.id)
      .eq("method", "cash"),
  ]);
  let cash = 0;
  let tips = 0;
  for (const p of payments ?? []) {
    if (p.method !== "cash") continue;
    cash += Number(p.amount) || 0;
    tips += Number(p.tip_amount) || 0;
  }
  const paidOut = (payouts ?? []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return Math.round((session.openingFloat + cash + tips - paidOut) * 100) / 100;
}

/** End-of-shift report for a till: payments tied to it and the lines of those bills. */
export async function loadZReport(supabase: SupabaseClient, tenantId: string, sessionId: string): Promise<ZReport> {
  const { data: payments } = await supabase
    .schema("hotel")
    .from("fb_order_payments")
    .select("order_id,method,amount,tip_amount")
    .eq("tenant_id", tenantId)
    .eq("cash_session_id", sessionId);
  const orderIds = [...new Set((payments ?? []).map((p) => p.order_id as string))];
  const lines: Record<string, unknown>[] = [];
  for (let i = 0; i < orderIds.length; i += 200) {
    const { data } = await supabase
      .schema("hotel")
      .from("fb_order_items")
      .select("kitchen_status,price_snapshot,quantity,comped_at,original_price,list_price")
      .in("order_id", orderIds.slice(i, i + 200));
    lines.push(...(data ?? []));
  }
  return zReport({
    bills: orderIds.length,
    payments: (payments ?? []).map((p) => ({
      method: p.method as string,
      amount: Number(p.amount) || 0,
      tip_amount: Number(p.tip_amount) || 0,
    })),
    lines: lines.map((l) => ({
      kitchen_status: l.kitchen_status as string,
      price_snapshot: Number(l.price_snapshot) || 0,
      quantity: Number(l.quantity) || 1,
      comped_at: (l.comped_at as string) ?? null,
      original_price: l.original_price == null ? null : Number(l.original_price),
      list_price: l.list_price == null ? null : Number(l.list_price),
    })),
  });
}

/**
 * Books tips handed to staff (owed goes down; cash or bank goes down) and,
 * for cash taken out of an open till, ties the payouts to it. Returns the
 * posting error, if any, without undoing the payout.
 */
export async function bookTipPayouts(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    payoutIds: string[];
    total: number;
    method: "cash" | "bank";
    tillSessionId?: string | null;
    actor: string;
  },
) {
  if (params.tillSessionId && params.method === "cash") {
    await supabase
      .schema("hotel")
      .from("fb_tip_payouts")
      .update({ cash_session_id: params.tillSessionId })
      .in("id", params.payoutIds)
      .eq("tenant_id", params.tenantId);
  }
  const [cash, bank, tipsOwed] = await Promise.all([
    getAccountIdByCode(supabase, params.tenantId, FB_CASHUP_ACCOUNTS.cash),
    getAccountIdByCode(supabase, params.tenantId, FB_CASHUP_ACCOUNTS.bank),
    getAccountIdByCode(supabase, params.tenantId, FB_CASHUP_ACCOUNTS.tipsOwed),
  ]);
  if (!cash || !bank || !tipsOwed) {
    return { journalEntryId: null, error: "Not booked: the chart of accounts is missing Cash on Hand, Bank Account or Accrued Expenses." };
  }
  const settings = await getTenantFbSettings(supabase, params.tenantId);
  const posted = await postJournalEntry(supabase, {
    tenantId: params.tenantId,
    entryDate: hotelDate(new Date(), settings.timeZone),
    memo: `Tips paid to staff (${params.method === "cash" ? "cash" : "bank transfer"})`,
    reference: `FB-TIPS-${params.payoutIds[0]?.slice(0, 8) ?? ""}`,
    createdBy: params.actor,
    lines: tipPayoutJournalLines(params.total, params.method, { cash, bank, tipsOwed }),
  });
  if (!posted.ok) return { journalEntryId: null, error: posted.error };
  await supabase
    .schema("hotel")
    .from("fb_tip_payouts")
    .update({ journal_entry_id: posted.id })
    .in("id", params.payoutIds)
    .eq("tenant_id", params.tenantId);
  return { journalEntryId: posted.id, error: null };
}
