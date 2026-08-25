import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postJournalEntry, type JournalEntryLineInput } from "@/lib/hms/journal-entries";

/**
 * Bridges the gap where day-to-day guest folio activity and walk-in F&B POS sales never
 * touched the general ledger — until this, only vendor bills and manually-raised customer
 * invoices posted anything. This reads (never writes) `hotel.folio_transactions` and
 * `hotel.fb_orders`, which Front Desk/F&B own, and posts one balanced summary entry.
 *
 * Guest Ledger (1200) is the hub: every folio charge/discount/refund debits or credits it
 * against a revenue account; every folio payment credits it against a cash/clearing
 * account. The single Guest Ledger balancing line at the end is what's left over — money
 * still owed by guests (debit) or a net settlement of prior balances (credit). Walk-in F&B
 * (settled directly at the outlet, never touching a guest's folio) skips Guest Ledger
 * entirely: it's a direct Dr cash/card, Cr F&B revenue pair.
 *
 * A room-charged F&B order posts its own `folio_transactions` charge line (department:
 * "food_beverage") — counting BOTH that folio line and the order's own subtotal would
 * double the revenue, so walk-in aggregation explicitly excludes settlement_method =
 * "room_charge" orders (those are only counted via the folio side).
 */

export type NightAuditBreakdown = {
  roomRevenue: number;
  fbRevenue: number;
  otherRevenue: number;
  unclassifiedRevenue: number;
  cashTotal: number;
  cardTotal: number;
  cityLedgerTotal: number;
  guestLedgerNet: number;
  unmatchedPaymentTotal: number;
  folioLineCount: number;
  walkInFbOrderCount: number;
};

export type NightAuditRunRow = {
  id: string;
  auditDate: string;
  journalEntryId: string | null;
  breakdown: Pick<
    NightAuditBreakdown,
    "roomRevenue" | "fbRevenue" | "otherRevenue" | "unclassifiedRevenue" | "cashTotal" | "cardTotal" | "cityLedgerTotal" | "guestLedgerNet"
  >;
  createdBy: string;
  createdAt: string;
};

function dayBoundsUtc(auditDate: string): { start: string; end: string } {
  const start = `${auditDate}T00:00:00.000Z`;
  const end = new Date(new Date(start).getTime() + 86_400_000).toISOString();
  return { start, end };
}

export async function computeNightAuditBreakdown(
  service: SupabaseClient,
  tenantId: string,
  auditDate: string,
): Promise<NightAuditBreakdown> {
  const { start, end } = dayBoundsUtc(auditDate);

  const { data: folioLines } = await service
    .schema("hotel")
    .from("folio_transactions")
    .select("kind,amount,method,department")
    .eq("tenant_id", tenantId)
    .is("voided_at", null)
    .gte("created_at", start)
    .lt("created_at", end);

  let folioRoomRevenue = 0;
  let folioFbRevenue = 0;
  let folioOtherRevenue = 0;
  let folioUnclassifiedRevenue = 0;
  let folioPaymentsCash = 0;
  let folioPaymentsCard = 0;
  let folioPaymentsCityLedger = 0;
  let unmatchedPaymentTotal = 0;

  const rows = (folioLines ?? []) as { kind: string; amount: number; method: string; department: string | null }[];
  for (const line of rows) {
    const amount = Math.abs(Number(line.amount) || 0);
    if (line.kind === "charge" || line.kind === "discount" || line.kind === "refund") {
      const sign = line.kind === "charge" ? 1 : -1;
      if (line.department === "rooms") folioRoomRevenue += sign * amount;
      else if (line.department === "food_beverage") folioFbRevenue += sign * amount;
      else if (line.department) folioOtherRevenue += sign * amount;
      else folioUnclassifiedRevenue += sign * amount;
    } else if (line.kind === "payment") {
      if (line.method === "cash") folioPaymentsCash += amount;
      else if (line.method === "card" || line.method === "pos") folioPaymentsCard += amount;
      else if (line.method === "direct_bill" || line.method === "split") folioPaymentsCityLedger += amount;
      else unmatchedPaymentTotal += amount;
    }
    // "transfer" kind lines are internal folio-to-folio reclassifications — excluded, since
    // a correctly paired transfer nets to zero and isn't new revenue or cash movement.
  }

  const { data: fbOrders } = await service
    .schema("hotel")
    .from("fb_orders")
    .select("subtotal,settlement_method")
    .eq("tenant_id", tenantId)
    .eq("status", "closed")
    .neq("settlement_method", "room_charge")
    .gte("closed_at", start)
    .lt("closed_at", end);

  let walkInFbRevenue = 0;
  let walkInCash = 0;
  let walkInCard = 0;
  const fbRows = (fbOrders ?? []) as { subtotal: number; settlement_method: string }[];
  for (const order of fbRows) {
    const amount = Number(order.subtotal) || 0;
    walkInFbRevenue += amount;
    if (order.settlement_method === "cash") walkInCash += amount;
    else if (order.settlement_method === "card" || order.settlement_method === "pos") walkInCard += amount;
  }

  const guestLedgerNet =
    folioRoomRevenue +
    folioFbRevenue +
    folioOtherRevenue +
    folioUnclassifiedRevenue -
    (folioPaymentsCash + folioPaymentsCard + folioPaymentsCityLedger);

  return {
    roomRevenue: folioRoomRevenue,
    fbRevenue: folioFbRevenue + walkInFbRevenue,
    otherRevenue: folioOtherRevenue,
    unclassifiedRevenue: folioUnclassifiedRevenue,
    cashTotal: folioPaymentsCash + walkInCash,
    cardTotal: folioPaymentsCard + walkInCard,
    cityLedgerTotal: folioPaymentsCityLedger,
    guestLedgerNet,
    unmatchedPaymentTotal,
    folioLineCount: rows.length,
    walkInFbOrderCount: fbRows.length,
  };
}

function buildLines(
  b: NightAuditBreakdown,
  accts: { room: string; fb: string; other: string; misc: string; cash: string; card: string; cityLedger: string; guestLedger: string },
): JournalEntryLineInput[] {
  const lines: JournalEntryLineInput[] = [];
  const revenueLine = (amount: number, accountId: string, department: string) => {
    if (amount === 0) return;
    if (amount > 0) lines.push({ accountId, department, debit: 0, credit: amount });
    else lines.push({ accountId, department, debit: -amount, credit: 0 });
  };

  revenueLine(b.roomRevenue, accts.room, "Front Desk");
  revenueLine(b.fbRevenue, accts.fb, "Kitchen");
  revenueLine(b.otherRevenue, accts.other, "Other");
  revenueLine(b.unclassifiedRevenue, accts.misc, "Other");

  if (b.cashTotal > 0) lines.push({ accountId: accts.cash, department: "Front Desk", debit: b.cashTotal, credit: 0 });
  if (b.cardTotal > 0) lines.push({ accountId: accts.card, department: "Front Desk", debit: b.cardTotal, credit: 0 });
  if (b.cityLedgerTotal > 0) lines.push({ accountId: accts.cityLedger, department: "Front Desk", debit: b.cityLedgerTotal, credit: 0 });

  if (b.guestLedgerNet > 0) lines.push({ accountId: accts.guestLedger, department: "Front Desk", debit: b.guestLedgerNet, credit: 0 });
  else if (b.guestLedgerNet < 0) lines.push({ accountId: accts.guestLedger, department: "Front Desk", debit: 0, credit: -b.guestLedgerNet });

  return lines;
}

export async function runNightAudit(
  service: SupabaseClient,
  params: { tenantId: string; auditDate: string; createdBy: string },
): Promise<{ ok: true; id: string; journalEntryId: string; breakdown: NightAuditBreakdown } | { ok: false; error: string }> {
  const { data: existing } = await service
    .schema("hotel")
    .from("night_audit_runs")
    .select("id,journal_entry_id")
    .eq("tenant_id", params.tenantId)
    .eq("audit_date", params.auditDate)
    .maybeSingle();

  if (existing) {
    const { data: entry } = await service
      .schema("hotel")
      .from("journal_entries")
      .select("id,reversed_by")
      .eq("tenant_id", params.tenantId)
      .eq("id", existing.journal_entry_id as string)
      .maybeSingle();
    if (!entry?.reversed_by) {
      return { ok: false, error: `${params.auditDate} was already audited. Reverse its journal entry first to redo it.` };
    }
  }

  const [room, fb, other, misc, cash, card, cityLedger, guestLedger] = await Promise.all([
    getAccountIdByCode(service, params.tenantId, "4000"),
    getAccountIdByCode(service, params.tenantId, "4100"),
    getAccountIdByCode(service, params.tenantId, "4200"),
    getAccountIdByCode(service, params.tenantId, "4300"),
    getAccountIdByCode(service, params.tenantId, "1000"),
    getAccountIdByCode(service, params.tenantId, "1020"),
    getAccountIdByCode(service, params.tenantId, "1300"),
    getAccountIdByCode(service, params.tenantId, "1200"),
  ]);
  const missing = [
    ["Room Revenue (4000)", room],
    ["Food & Beverage Revenue (4100)", fb],
    ["Other Operated Departments Revenue (4200)", other],
    ["Miscellaneous Income (4300)", misc],
    ["Cash on Hand (1000)", cash],
    ["Card & POS Clearing (1020)", card],
    ["City Ledger (1300)", cityLedger],
    ["Guest Ledger (1200)", guestLedger],
  ].filter(([, id]) => !id);
  if (missing.length > 0) {
    return { ok: false, error: `Missing required accounts: ${missing.map(([label]) => label).join(", ")}.` };
  }

  const breakdown = await computeNightAuditBreakdown(service, params.tenantId, params.auditDate);
  const lines = buildLines(breakdown, {
    room: room as string,
    fb: fb as string,
    other: other as string,
    misc: misc as string,
    cash: cash as string,
    card: card as string,
    cityLedger: cityLedger as string,
    guestLedger: guestLedger as string,
  });

  if (lines.length < 2) {
    return { ok: false, error: `Nothing to post for ${params.auditDate} — no folio or F&B activity found.` };
  }

  const posted = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: params.auditDate,
    memo: `Night audit — ${params.auditDate}`,
    createdBy: params.createdBy,
    lines,
  });
  if (!posted.ok) return posted;

  const { data: run, error } = await service
    .schema("hotel")
    .from("night_audit_runs")
    .upsert(
      {
        tenant_id: params.tenantId,
        audit_date: params.auditDate,
        journal_entry_id: posted.id,
        room_revenue: breakdown.roomRevenue,
        fb_revenue: breakdown.fbRevenue,
        other_revenue: breakdown.otherRevenue,
        unclassified_revenue: breakdown.unclassifiedRevenue,
        cash_total: breakdown.cashTotal,
        card_total: breakdown.cardTotal,
        city_ledger_total: breakdown.cityLedgerTotal,
        guest_ledger_net: breakdown.guestLedgerNet,
        created_by: params.createdBy,
      },
      { onConflict: "tenant_id,audit_date" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "night_audit_run",
    entityType: "night_audit_run",
    entityId: run.id as string,
    after: { audit_date: params.auditDate, journal_entry_id: posted.id },
  });

  return { ok: true, id: run.id as string, journalEntryId: posted.id, breakdown };
}

export async function listNightAuditRuns(service: SupabaseClient, tenantId: string): Promise<NightAuditRunRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("night_audit_runs")
    .select(
      "id,audit_date,journal_entry_id,room_revenue,fb_revenue,other_revenue,unclassified_revenue,cash_total,card_total,city_ledger_total,guest_ledger_net,created_by,created_at",
    )
    .eq("tenant_id", tenantId)
    .order("audit_date", { ascending: false });
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => ({
    id: r.id as string,
    auditDate: r.audit_date as string,
    journalEntryId: (r.journal_entry_id as string | null) ?? null,
    breakdown: {
      roomRevenue: Number(r.room_revenue) || 0,
      fbRevenue: Number(r.fb_revenue) || 0,
      otherRevenue: Number(r.other_revenue) || 0,
      unclassifiedRevenue: Number(r.unclassified_revenue) || 0,
      cashTotal: Number(r.cash_total) || 0,
      cardTotal: Number(r.card_total) || 0,
      cityLedgerTotal: Number(r.city_ledger_total) || 0,
      guestLedgerNet: Number(r.guest_ledger_net) || 0,
    },
    createdBy: r.created_by as string,
    createdAt: r.created_at as string,
  }));
}
