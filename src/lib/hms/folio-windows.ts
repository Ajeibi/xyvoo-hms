import type { SupabaseClient } from "@supabase/supabase-js";
import { FOLIO_WINDOWS, computeLegBalance, type FolioLineRow, type FolioSplitLeg } from "@/lib/hms/folio";
import { createCustomerInvoice } from "@/lib/hms/customer-invoices";

/*
 * Billing windows: a stay's bill split between up to four payers (the guest, a company, a travel
 * agent, one other). Routing rules send each group of charges to a window; the database applies
 * them to every new line (hotel.route_folio_line). At check-out, a window linked to a company
 * account is billed to that account in accounts receivable, so the guest only settles their own part.
 */

export * from "@/lib/hms/folio-windows-shared";
import {
  WINDOW_LABEL,
  routeFor,
  type BillingWindow,
  type ChargeGroup,
  type RoutingRule,
  type WindowPayer,
  type WindowSummary,
} from "@/lib/hms/folio-windows-shared";

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export async function loadWindows(supabase: SupabaseClient, tenantId: string, reservationId: string) {
  const [{ data: windows }, { data: rules }] = await Promise.all([
    supabase
      .schema("hotel")
      .from("folio_windows")
      .select("window,payer_name,ar_customer_id,ar_customers(name)")
      .eq("tenant_id", tenantId)
      .eq("reservation_id", reservationId),
    supabase
      .schema("hotel")
      .from("folio_routing_rules")
      .select("charge_group,target_window")
      .eq("tenant_id", tenantId)
      .eq("reservation_id", reservationId),
  ]);
  const payers: WindowPayer[] = (windows ?? []).map((w) => {
    const c = w.ar_customers as { name: string } | { name: string }[] | null;
    const customer = Array.isArray(c) ? c[0] : c;
    return {
      window: w.window as BillingWindow,
      payerName: w.payer_name as string,
      arCustomerId: (w.ar_customer_id as string | null) ?? null,
      arCustomerName: customer?.name ?? null,
    };
  });
  const routing: RoutingRule[] = (rules ?? []).map((r) => ({
    chargeGroup: r.charge_group as ChargeGroup,
    targetWindow: r.target_window as FolioSplitLeg,
  }));
  return { payers, rules: routing };
}

/** Every window in use (set up, or with lines on it), with its payer and what it still owes. */
export function summariseWindows(lines: FolioLineRow[], payers: WindowPayer[], guestName: string): WindowSummary[] {
  return FOLIO_WINDOWS.flatMap((w) => {
    const payer = payers.find((p) => p.window === w);
    const count = lines.filter((l) => !l.voided_at && l.split_leg === w).length;
    if (w !== "guest" && !payer && count === 0) return [];
    return [
      {
        window: w,
        label: WINDOW_LABEL[w],
        payerName: w === "guest" ? guestName : (payer?.payerName ?? WINDOW_LABEL[w]),
        balance: roundMoney(computeLegBalance(lines, w)),
        lineCount: count,
        arCustomerId: payer?.arCustomerId ?? null,
        arCustomerName: payer?.arCustomerName ?? null,
      },
    ];
  });
}

/** Sets up (or changes) a window's payer. */
export async function saveWindowPayer(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; window: BillingWindow; payerName: string; arCustomerId: string | null; userId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.arCustomerId) {
    const { data } = await supabase
      .schema("hotel")
      .from("ar_customers")
      .select("id")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.arCustomerId)
      .maybeSingle();
    if (!data) return { ok: false, error: "That company account wasn't found." };
  }
  const { error } = await supabase.schema("hotel").from("folio_windows").upsert(
    {
      tenant_id: params.tenantId,
      reservation_id: params.reservationId,
      window: params.window,
      payer_name: params.payerName.trim(),
      ar_customer_id: params.arCustomerId,
      created_by: params.userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "reservation_id,window" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Removes a window's payer. Refused while lines are still on that window. */
export async function removeWindowPayer(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; window: BillingWindow; lines: FolioLineRow[] },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (params.lines.some((l) => !l.voided_at && l.split_leg === params.window)) {
    return { ok: false, error: `Move the ${WINDOW_LABEL[params.window].toLowerCase()} window's lines to another payer first.` };
  }
  await supabase.schema("hotel").from("folio_routing_rules").delete().eq("tenant_id", params.tenantId).eq("reservation_id", params.reservationId).eq("target_window", params.window);
  const { error } = await supabase.schema("hotel").from("folio_windows").delete().eq("tenant_id", params.tenantId).eq("reservation_id", params.reservationId).eq("window", params.window);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * Saves a routing rule (or removes it with `target: null`) and moves the stay's existing charges
 * and discounts in that group to the window, except lines a person placed by hand. Payments stay.
 */
export async function saveRoutingRule(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; chargeGroup: ChargeGroup; target: FolioSplitLeg | null; userId: string; lines: FolioLineRow[]; payers: WindowPayer[] },
): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  const { tenantId, reservationId, chargeGroup, target } = params;
  if (target === null) {
    const { error } = await supabase.schema("hotel").from("folio_routing_rules").delete().eq("tenant_id", tenantId).eq("reservation_id", reservationId).eq("charge_group", chargeGroup);
    return error ? { ok: false, error: error.message } : { ok: true, moved: 0 };
  }
  if (target !== "guest" && !params.payers.some((p) => p.window === target)) {
    return { ok: false, error: `Set up who the ${WINDOW_LABEL[target].toLowerCase()} window is first.` };
  }
  const { error } = await supabase.schema("hotel").from("folio_routing_rules").upsert(
    { tenant_id: tenantId, reservation_id: reservationId, charge_group: chargeGroup, target_window: target, created_by: params.userId },
    { onConflict: "reservation_id,charge_group" },
  );
  if (error) return { ok: false, error: error.message };

  const rules = (await loadWindows(supabase, tenantId, reservationId)).rules;
  const toMove = params.lines.filter(
    (l) =>
      !l.voided_at &&
      (l.kind === "charge" || l.kind === "discount") &&
      l.metadata?.window_set !== true &&
      routeFor(rules, l.department) === target &&
      l.split_leg !== target,
  );
  if (toMove.length === 0) return { ok: true, moved: 0 };
  const { error: moveError } = await supabase
    .schema("hotel")
    .from("folio_transactions")
    .update({ split_leg: target })
    .eq("tenant_id", tenantId)
    .eq("reservation_id", reservationId)
    .in("id", toMove.map((l) => l.id));
  if (moveError) return { ok: false, error: moveError.message };
  return { ok: true, moved: toMove.length };
}

/** What check-out will do with each window: bill it to an account, or ask the guest to pay it. */
export function planWindowBilling(windows: WindowSummary[]) {
  const toAccounts = windows.filter((w) => w.window !== "guest" && w.balance > 0.009 && w.arCustomerId);
  const dueNow = roundMoney(windows.filter((w) => !toAccounts.includes(w)).reduce((s, w) => s + w.balance, 0));
  return { toAccounts, dueNow };
}

async function accountIdByCode(supabase: SupabaseClient, tenantId: string, code: string) {
  const { data } = await supabase.schema("hotel").from("chart_of_accounts").select("id").eq("tenant_id", tenantId).eq("code", code).eq("is_active", true).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * At check-out: moves each window linked to a company account into accounts receivable. On the
 * bill it is recorded as "billed to <company>" (a direct-bill payment on that window), which the
 * night audit moves from Guest Ledger (1200) to City Ledger (1300). The customer invoice that
 * tracks what the company owes is not booked as revenue again: the night audit already counted
 * the revenue from the bill's charges.
 */
export async function billWindowsToAccounts(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    reservationId: string;
    confirmationCode: string;
    folioNumber: string;
    roomCode: string | null;
    windows: WindowSummary[];
    currency: string;
    userId: string;
  },
): Promise<{ ok: true; billed: { window: FolioSplitLeg; payerName: string; amount: number; invoiceNumber: string }[] } | { ok: false; error: string }> {
  const { toAccounts } = planWindowBilling(params.windows);
  if (toAccounts.length === 0) return { ok: true, billed: [] };

  const [cityLedger, roomRevenue] = await Promise.all([
    accountIdByCode(supabase, params.tenantId, "1300"),
    accountIdByCode(supabase, params.tenantId, "4000"),
  ]);
  if (!cityLedger || !roomRevenue) {
    return { ok: false, error: "Add the City Ledger (1300) and Room Revenue (4000) accounts in Chart of accounts before billing a company." };
  }

  const today = new Date().toISOString().slice(0, 10);
  const billed: { window: FolioSplitLeg; payerName: string; amount: number; invoiceNumber: string }[] = [];
  for (const w of toAccounts) {
    const invoice = await createCustomerInvoice(supabase, {
      tenantId: params.tenantId,
      customerId: w.arCustomerId!,
      reservationId: params.reservationId,
      department: "Front Desk",
      invoiceDate: today,
      currency: params.currency,
      revenueAccountId: roomRevenue,
      arAccountId: cityLedger,
      subtotal: w.balance,
      notes: `Stay ${params.confirmationCode}${params.roomCode ? `, room ${params.roomCode}` : ""}: the ${WINDOW_LABEL[w.window].toLowerCase()} part of bill ${params.folioNumber}.`,
      createdBy: params.userId,
      skipJournal: true,
    });
    if (!invoice.ok) return { ok: false, error: `Couldn't bill ${w.payerName}: ${invoice.error}` };

    const { error } = await supabase.schema("hotel").from("folio_transactions").insert({
      tenant_id: params.tenantId,
      reservation_id: params.reservationId,
      kind: "payment",
      amount: -w.balance,
      method: "direct_bill",
      status: "posted",
      description: `Billed to ${w.payerName} (account invoice ${invoice.invoiceNumber})`,
      department: null,
      posted_by: params.userId,
      reference: `ar_invoice:${invoice.id}`,
      split_leg: w.window,
      currency_code: params.currency,
      metadata: { arInvoiceId: invoice.id, arCustomerId: w.arCustomerId, window_set: true },
    });
    if (error) return { ok: false, error: `Billed ${w.payerName}, but the bill couldn't be updated: ${error.message}` };
    billed.push({ window: w.window, payerName: w.payerName, amount: w.balance, invoiceNumber: invoice.invoiceNumber });
  }
  return { ok: true, billed };
}
