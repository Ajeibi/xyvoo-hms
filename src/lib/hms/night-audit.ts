import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postJournalEntry, type JournalEntryLineInput } from "@/lib/hms/journal-entries";
import { stayLinePart } from "@/lib/hms/folio";
import { getHotelTimeZone, zonedDayBounds } from "@/lib/hms/business-date";
import { getNightAuditSettings } from "@/lib/hms/night-audit-settings";
import { GOVERNMENT_TAX_PARTS, computeRoomReleases, markDeferredLines, type RoomRelease } from "@/lib/hms/night-audit-deferral";

export { GOVERNMENT_TAX_PARTS };

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
 *
 * VAT and the state and stamp levies on a room are the government's money, not the hotel's:
 * they go to Taxes Payable (2200) rather than Room Revenue. The service charge is the hotel's.
 */

export type NightAuditBreakdown = {
  /** Room revenue earned today: charges that count at once, plus the night released from Deferred Revenue. */
  roomRevenue: number;
  /** Room charges posted today under the night-by-night rule, held in Deferred Revenue (less any credited back). */
  roomDeferred: number;
  /** The share of held room charges earned tonight (already in roomRevenue). */
  roomReleased: number;
  fbRevenue: number;
  otherRevenue: number;
  unclassifiedRevenue: number;
  /** VAT and levies charged on rooms today (less any taken off), owed to the government. */
  taxesCollected: number;
  cashTotal: number;
  cardTotal: number;
  cityLedgerTotal: number;
  /** Deposits taken before arrival and moved onto bills today (out of Advance Guest Deposits). */
  depositsApplied: number;
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
  automatic: boolean;
  overrideReason: string | null;
  exceptionCount: number;
  noShowsProcessed: number;
  emailedAt: string | null;
  hasReport: boolean;
  /** The ledger posting was reversed, so the day is open again. */
  reversed: boolean;
};

export type NightAuditFolioRow = {
  kind: string;
  amount: number | string;
  method: string;
  department: string | null;
  metadata?: Record<string, unknown> | null;
  reference?: string | null;
  description?: string | null;
  /** A room charge held in Deferred Revenue and earned night by night. */
  deferred?: boolean;
};
export type NightAuditFbOrderRow = { id: string; subtotal: number | string; settlement_method: string };
export type NightAuditFbPayment = { order_id: string; method: string; amount: number | string };

/**
 * Adds up one day's folio lines (not voided) and walk-in F&B orders (closed, not room-charged).
 * An F&B bill can be paid in parts (some cash, some card), so cash and card come from its payment rows when it has them.
 */
export function summariseNightAudit(
  rows: NightAuditFolioRow[],
  fbRows: NightAuditFbOrderRow[],
  fbPayments: NightAuditFbPayment[] = [],
): NightAuditBreakdown {
  let folioRoomRevenue = 0;
  let roomDeferred = 0;
  let folioFbRevenue = 0;
  let folioOtherRevenue = 0;
  let folioUnclassifiedRevenue = 0;
  let taxesCollected = 0;
  let folioPaymentsCash = 0;
  let folioPaymentsCard = 0;
  let folioPaymentsCityLedger = 0;
  let folioPaymentsDeposit = 0;
  let unmatchedPaymentTotal = 0;

  for (const line of rows) {
    const amount = Math.abs(Number(line.amount) || 0);
    if (line.kind === "refund") {
      // Money handed back at the desk: out of the till or reversed on the card machine.
      if (line.method === "cash") folioPaymentsCash -= amount;
      else if (line.method === "card" || line.method === "pos") folioPaymentsCard -= amount;
      else unmatchedPaymentTotal -= amount;
    } else if (line.kind === "charge" || line.kind === "discount") {
      const sign = line.kind === "charge" ? 1 : -1;
      // A whole-bill discount says how it splits across departments; take each share off its revenue.
      const allocation = line.metadata?.allocation;
      if (line.kind === "discount" && Array.isArray(allocation) && allocation.length > 0) {
        for (const a of allocation as { department: string | null; amount: number }[]) {
          const share = Math.abs(Number(a.amount) || 0);
          if (a.department === "rooms") folioRoomRevenue -= share;
          else if (a.department === "food_beverage") folioFbRevenue -= share;
          else if (a.department) folioOtherRevenue -= share;
          else folioUnclassifiedRevenue -= share;
        }
        continue;
      }
      if (line.department === "rooms") {
        const part = stayLinePart({ metadata: line.metadata ?? {}, reference: line.reference ?? null, description: line.description ?? null });
        if (GOVERNMENT_TAX_PARTS.has(part)) taxesCollected += sign * amount;
        else if (line.deferred) roomDeferred += sign * amount;
        else folioRoomRevenue += sign * amount;
      } else if (line.department === "food_beverage") folioFbRevenue += sign * amount;
      else if (line.department) folioOtherRevenue += sign * amount;
      else folioUnclassifiedRevenue += sign * amount;
    } else if (line.kind === "payment") {
      if (line.method === "cash") folioPaymentsCash += amount;
      else if (line.method === "card" || line.method === "pos") folioPaymentsCard += amount;
      else if (line.method === "direct_bill" || line.method === "split") folioPaymentsCityLedger += amount;
      else if (line.method === "deposit") folioPaymentsDeposit += amount;
      else unmatchedPaymentTotal += amount;
    }
    // "transfer" kind lines are internal folio-to-folio reclassifications — excluded, since
    // a correctly paired transfer nets to zero and isn't new revenue or cash movement.
  }

  let walkInFbRevenue = 0;
  let walkInCash = 0;
  let walkInCard = 0;
  const paymentsByOrder = new Map<string, NightAuditFbPayment[]>();
  for (const p of fbPayments) {
    paymentsByOrder.set(p.order_id, [...(paymentsByOrder.get(p.order_id) ?? []), p]);
  }
  for (const order of fbRows) {
    const amount = Number(order.subtotal) || 0;
    walkInFbRevenue += amount;
    const payments = paymentsByOrder.get(order.id);
    if (payments?.length) {
      for (const p of payments) {
        const paid = Number(p.amount) || 0;
        if (p.method === "cash") walkInCash += paid;
        else if (p.method === "card" || p.method === "pos") walkInCard += paid;
      }
    } else if (order.settlement_method === "cash") walkInCash += amount;
    else if (order.settlement_method === "card" || order.settlement_method === "pos") walkInCard += amount;
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  const guestLedgerNet =
    folioRoomRevenue +
    roomDeferred +
    folioFbRevenue +
    folioOtherRevenue +
    folioUnclassifiedRevenue +
    taxesCollected -
    (folioPaymentsCash + folioPaymentsCard + folioPaymentsCityLedger + folioPaymentsDeposit);

  return {
    roomRevenue: round(folioRoomRevenue),
    roomDeferred: round(roomDeferred),
    roomReleased: 0,
    fbRevenue: round(folioFbRevenue + walkInFbRevenue),
    otherRevenue: round(folioOtherRevenue),
    unclassifiedRevenue: round(folioUnclassifiedRevenue),
    taxesCollected: round(taxesCollected),
    cashTotal: round(folioPaymentsCash + walkInCash),
    cardTotal: round(folioPaymentsCard + walkInCard),
    cityLedgerTotal: round(folioPaymentsCityLedger),
    depositsApplied: round(folioPaymentsDeposit),
    guestLedgerNet: round(guestLedgerNet),
    unmatchedPaymentTotal: round(unmatchedPaymentTotal),
    folioLineCount: rows.length,
    walkInFbOrderCount: fbRows.length,
  };
}

/** Adds tonight's released room revenue: earned today, moved out of Deferred Revenue. Pure. */
export function withRoomReleases(b: NightAuditBreakdown, releases: Pick<RoomRelease, "amount">[]): NightAuditBreakdown {
  const released = Math.round(releases.reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { ...b, roomRevenue: Math.round((b.roomRevenue + released) * 100) / 100, roomReleased: released };
}

export type BreakdownResult = NightAuditBreakdown & { releases: RoomRelease[] };

export async function computeNightAuditBreakdown(
  service: SupabaseClient,
  tenantId: string,
  auditDate: string,
  timeZone?: string,
  /** The first day room charges are spread over the nights; null leaves room revenue booked as charged. */
  nightlyFrom?: string | null,
): Promise<BreakdownResult> {
  // The day is the hotel's own business day: every bill line carries the date it belongs to.
  const zone = timeZone ?? (await getHotelTimeZone(service, tenantId));
  const { start, end } = zonedDayBounds(auditDate, zone);

  const [{ data: folioLines }, { data: fbOrders }] = await Promise.all([
    service
      .schema("hotel")
      .from("folio_transactions")
      .select("reservation_id,kind,amount,method,department,metadata,reference,description")
      .eq("tenant_id", tenantId)
      .is("voided_at", null)
      .eq("business_date", auditDate),
    service
      .schema("hotel")
      .from("fb_orders")
      .select("id,subtotal,settlement_method")
      .eq("tenant_id", tenantId)
      .eq("status", "closed")
      .neq("settlement_method", "room_charge")
      .gte("closed_at", start)
      .lt("closed_at", end),
  ]);

  const fbRows = (fbOrders ?? []) as NightAuditFbOrderRow[];
  const fbPayments: NightAuditFbPayment[] = [];
  for (let i = 0; i < fbRows.length; i += 200) {
    const { data } = await service
      .schema("hotel")
      .from("fb_order_payments")
      .select("order_id,method,amount")
      .in("order_id", fbRows.slice(i, i + 200).map((o) => o.id));
    fbPayments.push(...((data ?? []) as NightAuditFbPayment[]));
  }

  let rows = (folioLines ?? []) as (NightAuditFolioRow & { reservation_id: string | null })[];
  let releases: RoomRelease[] = [];
  if (nightlyFrom && auditDate >= nightlyFrom) {
    rows = await markDeferredLines(service, tenantId, rows, nightlyFrom, zone);
    releases = await computeRoomReleases(service, tenantId, auditDate, zone, nightlyFrom);
  }
  return { ...withRoomReleases(summariseNightAudit(rows, fbRows, fbPayments), releases), releases };
}

export type NightAuditAccounts = {
  room: string;
  fb: string;
  other: string;
  misc: string;
  cash: string;
  card: string;
  cityLedger: string;
  guestLedger: string;
  deposits: string | null;
  taxes: string | null;
  /** Deferred Revenue (2400), holding room charges until their nights pass. */
  deferred?: string | null;
};

/** The night audit's journal lines for a day's figures: one balanced entry. */
export function buildNightAuditLines(b: NightAuditBreakdown, accts: NightAuditAccounts): JournalEntryLineInput[] {
  const lines: JournalEntryLineInput[] = [];
  const revenueLine = (amount: number, accountId: string, department: string) => {
    if (amount === 0) return;
    if (amount > 0) lines.push({ accountId, department, debit: 0, credit: amount });
    else lines.push({ accountId, department, debit: -amount, credit: 0 });
  };

  revenueLine(b.roomRevenue, accts.room, "Front Desk");
  // Room charges posted today and held, less the share earned tonight (which is in room revenue above).
  if (accts.deferred) revenueLine(Math.round((b.roomDeferred - b.roomReleased) * 100) / 100, accts.deferred, "Front Desk");
  revenueLine(b.fbRevenue, accts.fb, "Kitchen");
  revenueLine(b.otherRevenue, accts.other, "Other");
  revenueLine(b.unclassifiedRevenue, accts.misc, "Other");
  if (accts.taxes) revenueLine(b.taxesCollected, accts.taxes, "Front Desk");

  // More given back than taken on a day leaves cash or card as a credit.
  const moneyLine = (amount: number, accountId: string) => {
    if (amount > 0) lines.push({ accountId, department: "Front Desk", debit: amount, credit: 0 });
    else if (amount < 0) lines.push({ accountId, department: "Front Desk", debit: 0, credit: -amount });
  };
  moneyLine(b.cashTotal, accts.cash);
  moneyLine(b.cardTotal, accts.card);
  if (b.cityLedgerTotal > 0) lines.push({ accountId: accts.cityLedger, department: "Front Desk", debit: b.cityLedgerTotal, credit: 0 });
  // A deposit moved onto a bill: the hotel no longer holds it for the guest, it pays their bill.
  if (b.depositsApplied > 0 && accts.deposits) lines.push({ accountId: accts.deposits, department: "Front Desk", debit: b.depositsApplied, credit: 0 });

  if (b.guestLedgerNet > 0) lines.push({ accountId: accts.guestLedger, department: "Front Desk", debit: b.guestLedgerNet, credit: 0 });
  else if (b.guestLedgerNet < 0) lines.push({ accountId: accts.guestLedger, department: "Front Desk", debit: 0, credit: -b.guestLedgerNet });

  return lines;
}

export async function runNightAudit(
  service: SupabaseClient,
  params: { tenantId: string; auditDate: string; createdBy: string; automatic?: boolean; overrideReason?: string | null },
): Promise<{ ok: true; id: string; journalEntryId: string | null; breakdown: NightAuditBreakdown } | { ok: false; error: string }> {
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
      return {
        ok: false,
        error: existing.journal_entry_id
          ? `${params.auditDate} was already audited. Reverse its journal entry first to redo it.`
          : `${params.auditDate} was already closed with nothing to post. Reopen it from the history first to redo it.`,
      };
    }
  }

  const [room, fb, other, misc, cash, card, cityLedger, guestLedger, deposits, taxes, deferred, settings] = await Promise.all([
    getAccountIdByCode(service, params.tenantId, "4000"),
    getAccountIdByCode(service, params.tenantId, "4100"),
    getAccountIdByCode(service, params.tenantId, "4200"),
    getAccountIdByCode(service, params.tenantId, "4300"),
    getAccountIdByCode(service, params.tenantId, "1000"),
    getAccountIdByCode(service, params.tenantId, "1020"),
    getAccountIdByCode(service, params.tenantId, "1300"),
    getAccountIdByCode(service, params.tenantId, "1200"),
    getAccountIdByCode(service, params.tenantId, "2300"),
    getAccountIdByCode(service, params.tenantId, "2200"),
    getAccountIdByCode(service, params.tenantId, "2400"),
    getNightAuditSettings(service, params.tenantId),
  ]);
  // Room revenue night by night starts with the first audit after it's on, and stays on once started.
  // Without a Deferred Revenue account it can't start; once started it can't carry on without one.
  const alreadyStarted = settings.nightlyRevenueFrom;
  if (alreadyStarted && !deferred) {
    return { ok: false, error: "Missing required accounts: Deferred Revenue (2400), which holds room charges until their nights pass." };
  }
  const nightlyFrom = alreadyStarted ?? (settings.nightlyRoomRevenue && deferred ? params.auditDate : null);
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

  const { releases, ...breakdown } = await computeNightAuditBreakdown(service, params.tenantId, params.auditDate, undefined, nightlyFrom);
  const lines = buildNightAuditLines(breakdown, {
    deferred: (deferred as string | null) ?? null,
    room: room as string,
    fb: fb as string,
    other: other as string,
    misc: misc as string,
    cash: cash as string,
    card: card as string,
    cityLedger: cityLedger as string,
    guestLedger: guestLedger as string,
    deposits: (deposits as string | null) ?? null,
    taxes: (taxes as string | null) ?? null,
  });
  if (breakdown.taxesCollected !== 0 && !taxes) {
    return { ok: false, error: "Missing required accounts: Taxes Payable (2200), for the VAT and levies charged on rooms today." };
  }
  if (breakdown.depositsApplied > 0 && !deposits) {
    return { ok: false, error: "Missing required accounts: Advance Guest Deposits (2300), for the deposits moved onto bills today." };
  }

  // A quiet day still closes: the business date moves on, with nothing to post.
  let journalEntryId: string | null = null;
  if (lines.length >= 2) {
    const posted = await postJournalEntry(service, {
      tenantId: params.tenantId,
      entryDate: params.auditDate,
      memo: `Night audit — ${params.auditDate}`,
      createdBy: params.createdBy,
      lines,
    });
    if (!posted.ok) return posted;
    journalEntryId = posted.id;
  }

  const { data: run, error } = await service
    .schema("hotel")
    .from("night_audit_runs")
    .upsert(
      {
        tenant_id: params.tenantId,
        audit_date: params.auditDate,
        journal_entry_id: journalEntryId,
        room_revenue: breakdown.roomRevenue,
        fb_revenue: breakdown.fbRevenue,
        other_revenue: breakdown.otherRevenue,
        unclassified_revenue: breakdown.unclassifiedRevenue,
        cash_total: breakdown.cashTotal,
        card_total: breakdown.cardTotal,
        city_ledger_total: breakdown.cityLedgerTotal,
        guest_ledger_net: breakdown.guestLedgerNet,
        created_by: params.createdBy,
        created_at: new Date().toISOString(),
        automatic: params.automatic ?? false,
        override_reason: params.overrideReason ?? null,
        report: null,
        emailed_at: null,
      },
      { onConflict: "tenant_id,audit_date" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  // Remember what was earned from each stay tonight, so the next night works from the running totals.
  await service.schema("hotel").from("room_revenue_releases").delete().eq("tenant_id", params.tenantId).eq("night_date", params.auditDate);
  if (releases.length > 0) {
    await service
      .schema("hotel")
      .from("room_revenue_releases")
      .insert(releases.map((r) => ({ tenant_id: params.tenantId, reservation_id: r.reservationId, night_date: r.nightDate, amount: r.amount })));
  }
  if (nightlyFrom && !alreadyStarted) {
    await service.schema("hotel").from("night_audit_settings").upsert({ tenant_id: params.tenantId, nightly_revenue_from: nightlyFrom }, { onConflict: "tenant_id" });
  }

  await writeAuditLog({
    tenantId: params.tenantId,
    actorUserId: params.createdBy,
    action: "night_audit_run",
    entityType: "night_audit_run",
    entityId: run.id as string,
    after: { audit_date: params.auditDate, journal_entry_id: journalEntryId, automatic: params.automatic ?? false, override_reason: params.overrideReason ?? null },
  });

  return { ok: true, id: run.id as string, journalEntryId, breakdown };
}

export async function listNightAuditRuns(service: SupabaseClient, tenantId: string): Promise<NightAuditRunRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("night_audit_runs")
    .select(
      "id,audit_date,journal_entry_id,room_revenue,fb_revenue,other_revenue,unclassified_revenue,cash_total,card_total,city_ledger_total,guest_ledger_net,created_by,created_at,automatic,override_reason,exceptions,no_shows_processed,emailed_at,report",
    )
    .eq("tenant_id", tenantId)
    .order("audit_date", { ascending: false })
    .limit(400);
  if (error) throw new Error(error.message);

  const entryIds = (data ?? []).map((r) => r.journal_entry_id as string | null).filter((id): id is string => Boolean(id));
  const reversedIds = new Set<string>();
  for (let i = 0; i < entryIds.length; i += 100) {
    const { data: entries } = await service.schema("hotel").from("journal_entries").select("id,reversed_by").eq("tenant_id", tenantId).in("id", entryIds.slice(i, i + 100));
    for (const e of entries ?? []) if (e.reversed_by) reversedIds.add(e.id as string);
  }

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
    automatic: Boolean(r.automatic),
    overrideReason: (r.override_reason as string | null) ?? null,
    exceptionCount: Array.isArray(r.exceptions) ? r.exceptions.length : 0,
    noShowsProcessed: Number(r.no_shows_processed) || 0,
    emailedAt: (r.emailed_at as string | null) ?? null,
    hasReport: r.report != null,
    reversed: Boolean(r.journal_entry_id && reversedIds.has(r.journal_entry_id as string)),
  }));
}
