import type { SupabaseClient } from "@supabase/supabase-js";
import { computeFolioBalance, mapFolioLineRow } from "@/lib/hms/folio";
import { isDateInClosedPeriod } from "@/lib/hms/accounting-periods";
import { addDaysToDate, getBusinessDate, zonedDayBounds } from "@/lib/hms/business-date";
import { splitNoShows } from "@/lib/hms/night-audit-no-shows";
import { getNightAuditSettings } from "@/lib/hms/night-audit-settings";

/*
 * What to look at before a day is closed. Each check is either a blocker (the audit can't be
 * run until it is fixed) or a warning (the audit can be run, but the manager must say so, and the
 * reason is kept with the run). Nothing here changes any data.
 */

export type CheckSeverity = "ok" | "info" | "warning" | "blocker";

export type AuditCheck = {
  key: string;
  title: string;
  severity: CheckSeverity;
  count: number;
  /** One plain sentence: what it means and what to do. */
  detail: string;
  items: string[];
  /** Where in the hotel software to fix it, as a path after /hms/<slug>/. */
  fixPath?: string;
};

export const REQUIRED_ACCOUNTS: [string, string][] = [
  ["4000", "Room Revenue"],
  ["4100", "Food & Beverage Revenue"],
  ["4200", "Other Operated Departments Revenue"],
  ["4300", "Miscellaneous Income"],
  ["1000", "Cash on Hand"],
  ["1020", "Card & POS Clearing"],
  ["1300", "City Ledger"],
  ["1200", "Guest Ledger"],
];

type GuestEmbed = { is_primary?: boolean; guests?: { first_name?: string | null; last_name?: string | null } | { first_name?: string | null; last_name?: string | null }[] | null };

export function guestNameOf(guests: GuestEmbed[] | null | undefined): string {
  const list = guests ?? [];
  const primary = list.find((g) => g.is_primary) ?? list[0];
  const g = Array.isArray(primary?.guests) ? primary?.guests[0] : primary?.guests;
  return [g?.first_name, g?.last_name].filter(Boolean).join(" ").trim() || "Guest";
}

type StayRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  room_units: { room_code?: string | null } | { room_code?: string | null }[] | null;
  reservation_guests: GuestEmbed[] | null;
};

const STAY_COLUMNS = "id,confirmation_code,status,arrival_at,departure_at,room_units!room_unit_id(room_code),reservation_guests(is_primary,guests(first_name,last_name))";

function stayLabel(r: StayRow, extra?: string) {
  const room = Array.isArray(r.room_units) ? r.room_units[0]?.room_code : r.room_units?.room_code;
  return `${room ? `Room ${room}` : "No room"} · ${guestNameOf(r.reservation_guests)} · ${r.confirmation_code}${extra ? ` · ${extra}` : ""}`;
}

const SHOWN = 8;

function build(key: string, title: string, rows: string[], severity: Exclude<CheckSeverity, "ok">, detail: string, okDetail: string, fixPath?: string): AuditCheck {
  if (rows.length === 0) return { key, title, severity: "ok", count: 0, detail: okDetail, items: [] };
  return { key, title, severity, count: rows.length, detail, items: rows.slice(0, SHOWN).concat(rows.length > SHOWN ? [`and ${rows.length - SHOWN} more`] : []), fixPath };
}

export type StayBalance = { label: string; balance: number };

/** Checked-out stays that still owe or are owed money. Pure so it can be tested. */
export function unbalancedStays(rows: StayBalance[]): string[] {
  return rows.filter((r) => Math.abs(r.balance) >= 0.01).map((r) => `${r.label} · ${r.balance > 0 ? "owes" : "is owed"} ${Math.abs(r.balance).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
}

export type AuditChecksResult = {
  date: string;
  businessDate: string;
  checks: AuditCheck[];
  blockers: number;
  warnings: number;
};

export async function runAuditChecks(service: SupabaseClient, tenantId: string, auditDate: string, now: Date = new Date()): Promise<AuditChecksResult> {
  const [info, settings] = await Promise.all([getBusinessDate(service, tenantId, now), getNightAuditSettings(service, tenantId)]);
  const { end } = zonedDayBounds(auditDate, info.timeZone);
  const dayEnd = addDaysToDate(auditDate, 1);
  const res = () => service.schema("hotel").from("reservations");
  const checks: AuditCheck[] = [];

  // Which day may be closed.
  let dateProblem: string | null = null;
  if (auditDate !== info.businessDate) {
    dateProblem =
      auditDate > info.businessDate
        ? `Days are closed in order. Close ${info.businessDate} first.`
        : `${auditDate} is already closed. The business date is ${info.businessDate}. To redo a closed day, reverse its journal entry (or, if nothing was posted for it, reopen it from the history).`;
  } else if (!info.canAudit) {
    dateProblem = `${auditDate} hasn't finished yet at the hotel. It can be closed from tomorrow.`;
  }
  checks.push({
    key: "business_date",
    title: "Business date",
    severity: dateProblem ? "blocker" : "ok",
    count: dateProblem ? 1 : 0,
    detail: dateProblem ?? `${auditDate} is the business date and its day has finished.`,
    items: [],
  });

  // Accounts the posting needs, and whether the month is still open.
  const [{ data: accounts }, { data: periods }] = await Promise.all([
    service.schema("hotel").from("chart_of_accounts").select("code").eq("tenant_id", tenantId).eq("is_active", true).in("code", [...REQUIRED_ACCOUNTS.map(([c]) => c), "2400"]),
    service.schema("hotel").from("accounting_periods").select("period_month,status").eq("tenant_id", tenantId),
  ]);
  const have = new Set((accounts ?? []).map((a) => a.code as string));
  const missing = REQUIRED_ACCOUNTS.filter(([code]) => !have.has(code)).map(([code, name]) => `${name} (${code})`);
  checks.push(build("accounts", "Ledger accounts", missing, "blocker", "Add these accounts under Accounts, Chart of accounts. The audit can't post without them.", "Every account the audit posts to is set up.", "accounts/chart"));
  checks.push(build("deferred_account", "Room revenue by night", have.has("2400") ? [] : ["Deferred Revenue (2400)"], "warning", "Add this account under Accounts, Chart of accounts. Until then each room charge is booked as revenue when it's posted, not night by night.", "Room charges are held in Deferred Revenue and earned night by night.", "accounts/chart"));
  const periodClosed =isDateInClosedPeriod((periods ?? []).map((p) => ({ month: p.period_month as string, status: p.status as "open" | "closing" | "closed" })), auditDate);
  checks.push(build("period", "Accounting month", periodClosed ? [auditDate.slice(0, 7)] : [], "blocker", "That month is closed. Reopen it under Accounts, Periods, or the posting will be refused.", "The month is open.", "accounts/periods"));

  const [dueOut, noRoomCharge, pendingArrivals, floats, fbBills, recentOut] = await Promise.all([
    res().select(STAY_COLUMNS).eq("tenant_id", tenantId).eq("status", "checked_in").lt("departure_at", `${dayEnd}T00:00:00Z`).order("departure_at").limit(200),
    res().select(`${STAY_COLUMNS},folio_transactions!folio_transactions_reservation_id_fkey(kind,department,voided_at)`).eq("tenant_id", tenantId).eq("status", "checked_in").lt("arrival_at", `${dayEnd}T00:00:00Z`).limit(300),
    res().select(STAY_COLUMNS).eq("tenant_id", tenantId).eq("status", "confirmed").lt("arrival_at", `${dayEnd}T00:00:00Z`).order("arrival_at", { ascending: false }).limit(200),
    service.schema("hotel").from("cash_float_sessions").select("id,opened_at,opening_balance").eq("tenant_id", tenantId).is("closed_at", null).lt("opened_at", end),
    service.schema("hotel").from("fb_orders").select("id,subtotal,status").eq("tenant_id", tenantId).in("status", ["open", "sent_to_kitchen", "ready"]).lt("created_at", end),
    res().select(STAY_COLUMNS).eq("tenant_id", tenantId).eq("status", "checked_out").gte("departure_at", `${addDaysToDate(auditDate, -45)}T00:00:00Z`).limit(300),
  ]);

  // Rooms still due out: they should have left by their departure date.
  checks.push(
    build(
      "due_out",
      "Rooms still due out",
      ((dueOut.data ?? []) as unknown as StayRow[]).filter((r) => r.departure_at.slice(0, 10) <= auditDate).map((r) => stayLabel(r, `was due ${r.departure_at.slice(0, 10)}`)),
      "warning",
      "These guests are past their departure date. Check them out, or extend the stay; each extra night is charged to the bill.",
      "Nobody is past their departure date.",
      "frontdesk/checkout",
    ),
  );

  // In-house stays carrying no room charge at all.
  const noCharge = ((noRoomCharge.data ?? []) as unknown as (StayRow & { folio_transactions: { kind: string; department: string | null; voided_at: string | null }[] | null })[]).filter(
    (r) => !(r.folio_transactions ?? []).some((l) => l.kind === "charge" && l.department === "rooms" && !l.voided_at),
  );
  checks.push(build("no_room_charge", "In-house rooms with no room charge", noCharge.map((r) => stayLabel(r)), "warning", "These guests are in the house but nothing for the room is on their bill. Add the room charge on the bill.", "Every room in the house is on a bill.", "frontdesk/stays"));

  // Arrivals that never came.
  const { recent: noShows, stale } = splitNoShows((pendingArrivals.data ?? []) as unknown as StayRow[], auditDate);
  checks.push(build("no_shows", "Arrivals who didn't come", noShows.map((r) => stayLabel(r, `due ${r.arrival_at.slice(0, 10)}`)), settings.processNoShows ? "info" : "warning", settings.processNoShows ? "Closing the day marks these as no-shows and applies the no-show rule. Check them in first if the guest is here." : "Automatic no-show handling is off, so these stay booked. Check them in, or mark them as no-shows from Arrivals.", "Every expected guest has arrived.", "frontdesk/arrivals"));

  checks.push(build("stale_arrivals", "Old bookings still waiting to arrive", stale.map((r) => stayLabel(r, `due ${r.arrival_at.slice(0, 10)}`)), "warning", "These were due days ago and are not handled automatically. Check them in, or mark them as no-shows or cancel them from Arrivals.", "No old booking is still waiting to arrive.", "frontdesk/arrivals"));

  checks.push(
    build(
      "cash_floats",
      "Cash drawers not handed in",
      (floats.data ?? []).map((f) => `Drawer opened ${String(f.opened_at).slice(0, 16).replace("T", " ")} with ${Number(f.opening_balance).toLocaleString("en-NG")}`),
      "warning",
      "Count and close these drawers so the day's cash is accounted for.",
      "All cash drawers are closed.",
      "frontdesk/folio",
    ),
  );

  checks.push(
    build(
      "fb_bills",
      "Open restaurant and bar bills",
      (fbBills.data ?? []).map((o) => `Bill ${String(o.id).slice(0, 8)} · ${Number(o.subtotal).toLocaleString("en-NG")} · ${o.status}`),
      "warning",
      "These bills aren't paid or voided, so their sales are not in tonight's revenue. Settle or void them.",
      "No restaurant or bar bill is left open.",
      "restaurant-bar",
    ),
  );

  // Stays that left owing money (or being owed), over the last 45 days.
  const left = (recentOut.data ?? []) as unknown as StayRow[];
  const balances: StayBalance[] = [];
  for (let i = 0; i < left.length; i += 100) {
    const slice = left.slice(i, i + 100);
    const { data: lines } = await service
      .schema("hotel")
      .from("folio_transactions")
      .select("*")
      .eq("tenant_id", tenantId)
      .in("reservation_id", slice.map((r) => r.id));
    const byStay = new Map<string, ReturnType<typeof mapFolioLineRow>[]>();
    for (const l of lines ?? []) {
      const mapped = mapFolioLineRow(l as Record<string, unknown>);
      byStay.set(mapped.reservation_id, [...(byStay.get(mapped.reservation_id) ?? []), mapped]);
    }
    for (const r of slice) {
      const stayLines = byStay.get(r.id) ?? [];
      if (stayLines.length === 0) continue;
      balances.push({ label: stayLabel(r), balance: Math.round(computeFolioBalance(stayLines).balance * 100) / 100 });
    }
  }
  checks.push(build("unbalanced", "Bills that don't balance", unbalancedStays(balances), "warning", "These guests have checked out but their bill isn't at zero. Settle or write them off before the books close.", "Every bill of a guest who left balances.", "frontdesk/stays"));

  const order: Record<CheckSeverity, number> = { blocker: 0, warning: 1, info: 2, ok: 3 };
  checks.sort((a, b) => order[a.severity] - order[b.severity]);
  return {
    date: auditDate,
    businessDate: info.businessDate,
    checks,
    blockers: checks.filter((c) => c.severity === "blocker").length,
    warnings: checks.filter((c) => c.severity === "warning").length,
  };
}
