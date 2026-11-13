import type { SupabaseClient } from "@supabase/supabase-js";
import { floorLabelPlain } from "@/lib/hms/floor-label";
import { getBusinessDate } from "@/lib/hms/business-date";
import { getHousekeepingDailyReport } from "@/lib/hms/housekeeping-reports";
import { stayLinePart } from "@/lib/hms/folio";
import { addDays, daysBetween, eachDate, formatLongDate, hotelDate, hotelDayStart, monthStart } from "@/lib/hms/reports/dates";
import { forecastDocument, getForecastReport } from "@/lib/hms/reports/forecast";
import { fetchAll, getReportTimeZone, getRoomInventory, loadFolioRevenue, loadStays, loadWalkInFb } from "@/lib/hms/reports/load";
import { getManagersReport, managersReportDocument } from "@/lib/hms/reports/managers";
import type { ReportCell, ReportDocument, ReportSection } from "@/lib/hms/reports/model";
import { buildDaySeries, nightsSold, proratedBudget, round2, sumPeriod } from "@/lib/hms/reports/numbers";
import { loadRoomTypeBudgets, loadRoomTypes } from "@/lib/hms/room-type-budgets";
import { customLabelMap, listCustomBookingOptionsSafe } from "@/lib/hms/booking-options";
import { prettifyOptionValue } from "@/lib/hms/booking-options-shared";

/*
 * The standard report library. Each report reads other modules' data and never changes it. A report
 * is a name, who may run it, whether it is for a day or a range, and a function that builds a
 * ReportDocument; the screen, the downloads and the scheduled emails all use that one document.
 */

export type ReportAudience = "finance" | "operations";
export type ReportPeriod = "day" | "range" | "none";
export type ReportGroup = "Management" | "Front desk" | "Money" | "Sales" | "Housekeeping";

export type ReportContext = {
  service: SupabaseClient;
  tenantId: string;
  currency: string;
  hotelName: string;
  timeZone: string;
  /** The calendar date at the hotel. */
  today: string;
  /** The day the hotel is still trading on, which trails the calendar until the night audit closes it. Reports open on this day. */
  businessDate: string;
};
export type ReportParams = { date: string; from: string; to: string };

export type ReportDef = {
  key: string;
  title: string;
  description: string;
  group: ReportGroup;
  audience: ReportAudience;
  period: ReportPeriod;
  build: (ctx: ReportContext, params: ReportParams) => Promise<ReportDocument>;
};

const MAX_RANGE_DAYS = 400;

export async function makeReportContext(service: SupabaseClient, tenantId: string, currency: string, hotelName: string, now = new Date()): Promise<ReportContext> {
  const info = await getBusinessDate(service, tenantId, now);
  return { service, tenantId, currency, hotelName, timeZone: info.timeZone, today: info.today, businessDate: info.businessDate };
}

export function defaultParams(today: string): ReportParams {
  return { date: today, from: monthStart(today), to: today };
}

/** Keeps a range sensible: the right way round and not longer than a little over a year. */
export function clampParams(p: ReportParams): ReportParams {
  const from = p.from <= p.to ? p.from : p.to;
  const to = p.from <= p.to ? p.to : p.from;
  return { date: p.date, from: daysBetween(from, to) > MAX_RANGE_DAYS ? addDays(to, -MAX_RANGE_DAYS) : from, to };
}

const money = (v: number | null): ReportCell => ({ v, kind: "money" });
const num = (v: number | null): ReportCell => ({ v, kind: "number" });
const pct = (v: number | null): ReportCell => ({ v, kind: "percent" });

const STATUS_LABEL: Record<string, string> = {
  confirmed: "Booked",
  checked_in: "In house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "No-show",
};
const SOURCE_LABEL: Record<string, string> = {
  walk_in: "Walk-in",
  phone: "Phone",
  referral: "Referral",
  ota: "Online travel site",
  website: "Website",
  travel_agent: "Travel agent",
  airbnb: "Airbnb",
  e_guest: "E-guest",
  e_commerce: "E-commerce",
};
const SEGMENT_LABEL: Record<string, string> = { transient: "Individual", corporate: "Corporate", group: "Group", government: "Government", wholesale: "Wholesale", hotel_booking: "Hotel booking" };

/**
 * Names for a stay's source and market segment: the standard wording, then the hotel's own options (renamed
 * or switched off included), then a tidy version of the stored key, so a custom value is never dropped or shown raw.
 */
async function optionLabelers(ctx: ReportContext) {
  const custom = await listCustomBookingOptionsSafe(ctx.service, ctx.tenantId);
  const own = { source: customLabelMap(custom, "source"), segment: customLabelMap(custom, "segment") };
  return {
    source: (v: string) => SOURCE_LABEL[v] ?? own.source[v] ?? prettifyOptionValue(v),
    segment: (v: string) => SEGMENT_LABEL[v] ?? own.segment[v] ?? prettifyOptionValue(v),
  };
}

type StayListRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number;
  adults: number;
  room_type_code: string;
  rate_per_night: number | string;
  total_room_charges: number | string;
  source: string;
  market_segment: string;
  room_units: { room_code: string } | { room_code: string }[] | null;
  reservation_guests: { is_primary: boolean; guests: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null }[] | null;
};

const STAY_LIST_SELECT =
  "id,confirmation_code,status,arrival_at,departure_at,nights,adults,room_type_code,rate_per_night,total_room_charges,source,market_segment,room_units!room_unit_id(room_code),reservation_guests(is_primary,guests(first_name,last_name))";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function guestOf(r: StayListRow): string {
  const links = r.reservation_guests ?? [];
  const link = links.find((l) => l.is_primary) ?? links[0];
  const g = one(link?.guests);
  return g ? `${g.first_name} ${g.last_name}`.trim() : "—";
}

const roomOf = (r: StayListRow) => one(r.room_units)?.room_code ?? "Not assigned";
const n = (v: number | string | null | undefined) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v ?? ""));
  return Number.isFinite(x) ? x : 0;
};

type TimeRange = { gte?: string; lt?: string };
type StayFilter = { statuses: string[]; arrival?: TimeRange; departure?: TimeRange };

async function listStays(ctx: ReportContext, filter: StayFilter): Promise<StayListRow[]> {
  return fetchAll<StayListRow>((a, b) => {
    let q = ctx.service.schema("hotel").from("reservations").select(STAY_LIST_SELECT).eq("tenant_id", ctx.tenantId).in("status", filter.statuses);
    if (filter.arrival?.gte) q = q.gte("arrival_at", filter.arrival.gte);
    if (filter.arrival?.lt) q = q.lt("arrival_at", filter.arrival.lt);
    if (filter.departure?.gte) q = q.gte("departure_at", filter.departure.gte);
    if (filter.departure?.lt) q = q.lt("departure_at", filter.departure.lt);
    return q.order("arrival_at", { ascending: true }).order("id", { ascending: true }).range(a, b);
  });
}

const dayRange = (date: string): TimeRange => ({ gte: `${date}T00:00:00Z`, lt: `${addDays(date, 1)}T00:00:00Z` });
const spanRange = (from: string, to: string): TimeRange => ({ gte: `${from}T00:00:00Z`, lt: `${addDays(to, 1)}T00:00:00Z` });

type Balance = { charges: number; credits: number; balance: number };

/** What each stay's bill stands at: charges less payments, from lines not voided. */
export async function folioBalances(ctx: ReportContext, ids: string[]): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>(ids.map((id) => [id, { charges: 0, credits: 0, balance: 0 }]));
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const lines = await fetchAll<{ reservation_id: string; amount: number | string }>((a, b) =>
      ctx.service
        .schema("hotel")
        .from("folio_transactions")
        .select("reservation_id,amount")
        .eq("tenant_id", ctx.tenantId)
        .is("voided_at", null)
        .in("reservation_id", chunk)
        .order("id", { ascending: true })
        .range(a, b),
    );
    for (const l of lines) {
      const row = out.get(l.reservation_id);
      if (!row) continue;
      const amount = n(l.amount);
      if (amount >= 0) row.charges += amount;
      else row.credits += -amount;
      row.balance += amount;
    }
  }
  for (const v of out.values()) {
    v.charges = round2(v.charges);
    v.credits = round2(v.credits);
    v.balance = round2(v.balance);
  }
  return out;
}

function doc(def: Pick<ReportDef, "key" | "title">, ctx: ReportContext, subtitle: string, sections: ReportSection[], notes: string[] = []): ReportDocument {
  return { key: def.key, title: def.title, subtitle, currency: ctx.currency, sections, notes };
}

const rangeText = (p: ReportParams) => (p.from === p.to ? formatLongDate(p.from) : `${formatLongDate(p.from)} to ${formatLongDate(p.to)}`);

/* ---------- Front desk ---------- */

const stayColumns = (extra: ReportSection["columns"]): ReportSection["columns"] => [
  { key: "code", label: "Confirmation", kind: "text" },
  { key: "guest", label: "Guest", kind: "text" },
  { key: "room", label: "Room", kind: "text" },
  { key: "type", label: "Room type", kind: "text" },
  ...extra,
];

const ARRIVALS: ReportDef = {
  key: "arrivals",
  title: "Arrivals",
  description: "Everyone due to arrive on a day, with their room, nights and whether they have checked in.",
  group: "Front desk",
  audience: "operations",
  period: "day",
  async build(ctx, p) {
    const rows = await listStays(ctx, { statuses: ["confirmed", "checked_in", "checked_out"], arrival: dayRange(p.date) });
    const label = await optionLabelers(ctx);
    return doc(
      ARRIVALS,
      ctx,
      formatLongDate(p.date),
      [
        {
          columns: stayColumns([
            { key: "arrival", label: "Arrival time", kind: "text" },
            { key: "nights", label: "Nights", kind: "number" },
            { key: "adults", label: "Adults", kind: "number" },
            { key: "source", label: "Booked through", kind: "text" },
            { key: "status", label: "Status", kind: "text" },
          ]),
          rows: rows.map((r) => ({
            code: r.confirmation_code,
            guest: guestOf(r),
            room: roomOf(r),
            type: r.room_type_code,
            arrival: r.arrival_at.slice(11, 16),
            nights: num(r.nights),
            adults: num(r.adults),
            source: label.source(r.source),
            status: STATUS_LABEL[r.status] ?? r.status,
          })),
          totals: rows.length ? { code: `${rows.length} arrival${rows.length === 1 ? "" : "s"}`, nights: num(rows.reduce((s, r) => s + r.nights, 0)), adults: num(rows.reduce((s, r) => s + r.adults, 0)) } : undefined,
          emptyMessage: "No arrivals on this day.",
        },
      ],
    );
  },
};

const DEPARTURES: ReportDef = {
  key: "departures",
  title: "Departures",
  description: "Everyone due to leave on a day, and what is still owed on their bill.",
  group: "Front desk",
  audience: "operations",
  period: "day",
  async build(ctx, p) {
    const rows = await listStays(ctx, { statuses: ["checked_in", "checked_out"], departure: dayRange(p.date) });
    const balances = await folioBalances(ctx, rows.map((r) => r.id));
    return doc(
      DEPARTURES,
      ctx,
      formatLongDate(p.date),
      [
        {
          columns: stayColumns([
            { key: "departure", label: "Departure time", kind: "text" },
            { key: "nights", label: "Nights", kind: "number" },
            { key: "status", label: "Status", kind: "text" },
            { key: "balance", label: "Balance on bill", kind: "money" },
          ]),
          rows: rows.map((r) => ({
            code: r.confirmation_code,
            guest: guestOf(r),
            room: roomOf(r),
            type: r.room_type_code,
            departure: r.departure_at.slice(11, 16),
            nights: num(r.nights),
            status: STATUS_LABEL[r.status] ?? r.status,
            balance: money(balances.get(r.id)?.balance ?? 0),
          })),
          totals: rows.length ? { code: `${rows.length} departure${rows.length === 1 ? "" : "s"}`, balance: money(round2(rows.reduce((s, r) => s + (balances.get(r.id)?.balance ?? 0), 0))) } : undefined,
          emptyMessage: "No departures on this day.",
        },
      ],
      ["Balance on bill is charges less payments. A positive figure is still owed by the guest."],
    );
  },
};

const IN_HOUSE: ReportDef = {
  key: "in-house",
  title: "In-house guests",
  description: "Who is in the hotel right now, with their room, stay dates and bill balance.",
  group: "Front desk",
  audience: "operations",
  period: "none",
  async build(ctx) {
    const rows = await listStays(ctx, { statuses: ["checked_in"] });
    const balances = await folioBalances(ctx, rows.map((r) => r.id));
    const sorted = [...rows].sort((a, b) => roomOf(a).localeCompare(roomOf(b), undefined, { numeric: true }));
    return doc(
      IN_HOUSE,
      ctx,
      `Right now · ${formatLongDate(ctx.today)}`,
      [
        {
          columns: stayColumns([
            { key: "arrival", label: "Arrived", kind: "date" },
            { key: "departure", label: "Leaves", kind: "date" },
            { key: "adults", label: "Adults", kind: "number" },
            { key: "rate", label: "Rate per night", kind: "money" },
            { key: "balance", label: "Balance on bill", kind: "money" },
          ]),
          rows: sorted.map((r) => ({
            code: r.confirmation_code,
            guest: guestOf(r),
            room: roomOf(r),
            type: r.room_type_code,
            arrival: r.arrival_at.slice(0, 10),
            departure: r.departure_at.slice(0, 10),
            adults: num(r.adults),
            rate: money(n(r.rate_per_night)),
            balance: money(balances.get(r.id)?.balance ?? 0),
          })),
          totals: sorted.length ? { code: `${sorted.length} in house`, adults: num(sorted.reduce((s, r) => s + r.adults, 0)), balance: money(round2(sorted.reduce((s, r) => s + (balances.get(r.id)?.balance ?? 0), 0))) } : undefined,
          emptyMessage: "Nobody is in house.",
        },
      ],
    );
  },
};

const GUEST_LEDGER: ReportDef = {
  key: "guest-ledger",
  title: "Guest ledger",
  description: "Open bills: what in-house guests owe now, and guests who left in the last 30 days with money still owing.",
  group: "Money",
  audience: "finance",
  period: "none",
  async build(ctx) {
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const inHouse = await listStays(ctx, { statuses: ["checked_in"] });
    const left = await listStays(ctx, { statuses: ["checked_out"], departure: { gte: since } });
    const balances = await folioBalances(ctx, [...inHouse, ...left].map((r) => r.id));
    const cols = stayColumns([
      { key: "dates", label: "Stay", kind: "text" },
      { key: "charges", label: "Charges", kind: "money" },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "balance", label: "Balance", kind: "money" },
    ]);
    const section = (title: string, list: StayListRow[], onlyOwing: boolean): ReportSection => {
      const shown = list.filter((r) => !onlyOwing || (balances.get(r.id)?.balance ?? 0) > 0.009);
      return {
        title,
        columns: cols,
        rows: shown.map((r) => {
          const b = balances.get(r.id)!;
          return { code: r.confirmation_code, guest: guestOf(r), room: roomOf(r), type: r.room_type_code, dates: `${r.arrival_at.slice(5, 10)} to ${r.departure_at.slice(5, 10)}`, charges: money(b.charges), paid: money(b.credits), balance: money(b.balance) };
        }),
        totals: shown.length
          ? { code: "Total", charges: money(round2(shown.reduce((s, r) => s + balances.get(r.id)!.charges, 0))), paid: money(round2(shown.reduce((s, r) => s + balances.get(r.id)!.credits, 0))), balance: money(round2(shown.reduce((s, r) => s + balances.get(r.id)!.balance, 0))) }
          : undefined,
        emptyMessage: onlyOwing ? "Nobody who left recently still owes money." : "Nobody is in house.",
      };
    };
    return doc(GUEST_LEDGER, ctx, `Right now · ${formatLongDate(ctx.today)}`, [section("In-house guests", inHouse, false), section("Checked out, still owing", left, true)], [
      "Balance is charges less payments on each guest's bill. A positive balance is owed to the hotel; a negative one is the guest's credit.",
    ]);
  },
};

/* ---------- Money ---------- */

const CASHIER: ReportDef = {
  key: "cashier",
  title: "Cashier report",
  description: "Payments taken and refunds paid by day and by method, and the cash drawers opened and closed.",
  group: "Money",
  audience: "finance",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const lines = await fetchAll<{ kind: string; method: string; amount: number | string; created_at: string; pos_terminal_name: string | null; metadata: { depositMethod?: string } | null }>((a, b) =>
      ctx.service
        .schema("hotel")
        .from("folio_transactions")
        .select("kind,method,amount,created_at,pos_terminal_name,metadata")
        .eq("tenant_id", ctx.tenantId)
        .is("voided_at", null)
        .in("kind", ["payment", "refund"])
        .gte("created_at", hotelDayStart(p.from, ctx.timeZone))
        .lt("created_at", hotelDayStart(addDays(p.to, 1), ctx.timeZone))
        .order("id", { ascending: true })
        .range(a, b),
    );
    const fb = await fetchAll<{ settlement_method: string; subtotal: number | string; closed_at: string }>((a, b) =>
      ctx.service
        .schema("hotel")
        .from("fb_orders")
        .select("settlement_method,subtotal,closed_at")
        .eq("tenant_id", ctx.tenantId)
        .eq("status", "closed")
        .in("settlement_method", ["cash", "card", "pos"])
        .gte("closed_at", hotelDayStart(p.from, ctx.timeZone))
        .lt("closed_at", hotelDayStart(addDays(p.to, 1), ctx.timeZone))
        .order("id", { ascending: true })
        .range(a, b),
    );
    const bucket = (method: string) => (method === "cash" ? "cash" : method === "card" || method === "pos" ? "card" : "other");
    type Day = { cash: number; card: number; other: number; refunds: number };
    const days = new Map<string, Day>(eachDate(p.from, p.to).map((d) => [d, { cash: 0, card: 0, other: 0, refunds: 0 }]));
    const methods = new Map<string, { count: number; total: number }>();
    // Card machine payments by machine; payments with no machine (older ones, or a hotel with none set up) are grouped apart.
    const terminals = new Map<string, { count: number; total: number }>();
    for (const l of lines) {
      const day = days.get(hotelDate(l.created_at, ctx.timeZone));
      const amount = Math.abs(n(l.amount));
      if (!day) continue;
      if (l.kind === "refund") day.refunds += amount;
      else day[bucket(l.method)] += amount;
      const key = l.kind === "refund" ? `Refund (${l.method})` : l.method;
      const m = methods.get(key) ?? { count: 0, total: 0 };
      m.count += 1;
      m.total += amount;
      methods.set(key, m);
      // A deposit taken on a card machine counts here too, once it is on the bill (it shows under Other by day).
      const onCardMachine = l.method === "pos" || (l.method === "deposit" && l.metadata?.depositMethod === "pos");
      if (l.kind !== "refund" && onCardMachine) {
        const tKey = l.pos_terminal_name?.trim() || "No machine recorded";
        const t = terminals.get(tKey) ?? { count: 0, total: 0 };
        t.count += 1;
        t.total += amount;
        terminals.set(tKey, t);
      }
    }
    for (const o of fb) {
      const day = days.get(hotelDate(o.closed_at, ctx.timeZone));
      if (!day) continue;
      day[bucket(o.settlement_method)] += n(o.subtotal);
      const key = `Outlet sales (${o.settlement_method})`;
      const m = methods.get(key) ?? { count: 0, total: 0 };
      m.count += 1;
      m.total += n(o.subtotal);
      methods.set(key, m);
    }
    const dayRows = [...days.entries()].filter(([, d]) => d.cash + d.card + d.other + d.refunds > 0);
    const sessions = await fetchAll<{ opened_at: string; closed_at: string | null; opening_balance: number | string; expected_balance: number | string | null; closing_balance: number | string | null; variance: number | string | null }>((a, b) =>
      ctx.service
        .schema("hotel")
        .from("cash_float_sessions")
        .select("opened_at,closed_at,opening_balance,expected_balance,closing_balance,variance")
        .eq("tenant_id", ctx.tenantId)
        .gte("opened_at", hotelDayStart(p.from, ctx.timeZone))
        .lt("opened_at", hotelDayStart(addDays(p.to, 1), ctx.timeZone))
        .order("opened_at", { ascending: true })
        .range(a, b),
    );
    const tot = dayRows.reduce((s, [, d]) => ({ cash: s.cash + d.cash, card: s.card + d.card, other: s.other + d.other, refunds: s.refunds + d.refunds }), { cash: 0, card: 0, other: 0, refunds: 0 });
    return doc(
      CASHIER,
      ctx,
      rangeText(p),
      [
        {
          title: "By day",
          columns: [
            { key: "date", label: "Date", kind: "date" },
            { key: "cash", label: "Cash in", kind: "money" },
            { key: "card", label: "Card and POS in", kind: "money" },
            { key: "other", label: "Other in (bank, company, deposit)", kind: "money" },
            { key: "refunds", label: "Refunds paid out", kind: "money" },
            { key: "net", label: "Net", kind: "money" },
          ],
          rows: dayRows.map(([date, d]) => ({ date, cash: money(round2(d.cash)), card: money(round2(d.card)), other: money(round2(d.other)), refunds: money(round2(d.refunds)), net: money(round2(d.cash + d.card + d.other - d.refunds)) })),
          totals: dayRows.length ? { date: "Total", cash: money(round2(tot.cash)), card: money(round2(tot.card)), other: money(round2(tot.other)), refunds: money(round2(tot.refunds)), net: money(round2(tot.cash + tot.card + tot.other - tot.refunds)) } : undefined,
          emptyMessage: "No payments or refunds in this period.",
        },
        {
          title: "By method",
          columns: [
            { key: "method", label: "Method", kind: "text" },
            { key: "count", label: "Payments", kind: "number" },
            { key: "total", label: "Amount", kind: "money" },
          ],
          rows: [...methods.entries()].sort((a, b) => b[1].total - a[1].total).map(([method, m]) => ({ method, count: num(m.count), total: money(round2(m.total)) })),
          emptyMessage: "No payments or refunds in this period.",
        },
        {
          title: "Card machines",
          columns: [
            { key: "terminal", label: "Card machine", kind: "text" },
            { key: "count", label: "Payments", kind: "number" },
            { key: "total", label: "Amount", kind: "money" },
          ],
          rows: [...terminals.entries()].sort((a, b) => b[1].total - a[1].total).map(([terminal, t]) => ({ terminal, count: num(t.count), total: money(round2(t.total)) })),
          emptyMessage: "No card machine payments in this period.",
        },
        {
          title: "Cash drawers",
          columns: [
            { key: "opened", label: "Opened", kind: "text" },
            { key: "closed", label: "Closed", kind: "text" },
            { key: "opening", label: "Opening cash", kind: "money" },
            { key: "expected", label: "Expected", kind: "money" },
            { key: "counted", label: "Counted", kind: "money" },
            { key: "variance", label: "Difference", kind: "money" },
          ],
          rows: sessions.map((s) => ({
            opened: s.opened_at.slice(0, 16).replace("T", " "),
            closed: s.closed_at ? s.closed_at.slice(0, 16).replace("T", " ") : "Still open",
            opening: money(n(s.opening_balance)),
            expected: money(s.expected_balance == null ? null : n(s.expected_balance)),
            counted: money(s.closing_balance == null ? null : n(s.closing_balance)),
            variance: money(s.variance == null ? null : n(s.variance)),
          })),
          emptyMessage: "No cash drawers were opened in this period.",
        },
      ],
      ["Bills settled to a company or deposit are shown as Other, and the Card machines table also counts deposits taken on a card machine. Outlet sales are closed restaurant and bar bills paid in cash, by card or by POS at the outlet; room-charged bills are already on guests' bills."],
    );
  },
};

const TAX: ReportDef = {
  key: "tax",
  title: "Tax collected",
  description: "VAT, state levy, stamp levy and service charge posted on rooms, day by day.",
  group: "Money",
  audience: "finance",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const lines = await loadFolioRevenue(ctx.service, ctx.tenantId, p.from, p.to, ctx.timeZone);
    type D = { vat: number; state: number; stamp: number; service: number };
    const days = new Map<string, D>();
    for (const l of lines) {
      if (l.department !== "rooms" || (l.kind !== "charge" && l.kind !== "discount")) continue;
      const part = stayLinePart({ metadata: l.metadata ?? {}, reference: l.reference ?? null, description: l.description ?? null });
      const key = part === "vat" ? "vat" : part === "state_levy" ? "state" : part === "stamp_levy" ? "stamp" : part === "service_charge" ? "service" : null;
      if (!key) continue;
      const date = hotelDate(l.created_at, ctx.timeZone);
      const d = days.get(date) ?? { vat: 0, state: 0, stamp: 0, service: 0 };
      d[key] += (l.kind === "charge" ? 1 : -1) * Math.abs(n(l.amount));
      days.set(date, d);
    }
    const rows = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
    const t = rows.reduce((s, [, d]) => ({ vat: s.vat + d.vat, state: s.state + d.state, stamp: s.stamp + d.stamp, service: s.service + d.service }), { vat: 0, state: 0, stamp: 0, service: 0 });
    return doc(
      TAX,
      ctx,
      rangeText(p),
      [
        {
          columns: [
            { key: "date", label: "Date posted", kind: "date" },
            { key: "vat", label: "VAT", kind: "money" },
            { key: "state", label: "State levy", kind: "money" },
            { key: "stamp", label: "Stamp levy", kind: "money" },
            { key: "gov", label: "Owed to government", kind: "money" },
            { key: "service", label: "Service charge (hotel's)", kind: "money" },
          ],
          rows: rows.map(([date, d]) => ({ date, vat: money(round2(d.vat)), state: money(round2(d.state)), stamp: money(round2(d.stamp)), gov: money(round2(d.vat + d.state + d.stamp)), service: money(round2(d.service)) })),
          totals: rows.length ? { date: "Total", vat: money(round2(t.vat)), state: money(round2(t.state)), stamp: money(round2(t.stamp)), gov: money(round2(t.vat + t.state + t.stamp)), service: money(round2(t.service)) } : undefined,
          emptyMessage: "No room taxes were posted in this period.",
        },
      ],
      ["Taxes are posted when a stay is checked in, so each day shows what was posted that day. For the monthly returns, use Accounts, Tax reports."],
    );
  },
};

const REVENUE_BY_DEPARTMENT: ReportDef = {
  key: "revenue",
  title: "Revenue by department",
  description: "Rooms sold, occupancy, ADR, RevPAR and revenue for rooms, food and beverage and other departments, day by day.",
  group: "Management",
  audience: "finance",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const [{ total: roomCount, outOfOrder }, stays, folio, walkIn] = await Promise.all([
      getRoomInventory(ctx.service, ctx.tenantId),
      loadStays(ctx.service, ctx.tenantId, p.from, p.to),
      loadFolioRevenue(ctx.service, ctx.tenantId, p.from, p.to, ctx.timeZone),
      loadWalkInFb(ctx.service, ctx.tenantId, p.from, p.to, ctx.timeZone),
    ]);
    const series = buildDaySeries({ dates: eachDate(p.from, p.to), roomCount, outOfOrder, stays, folio, walkIn, today: ctx.today, dateOf: (i) => hotelDate(i, ctx.timeZone) });
    const row = (date: string) => {
      const f = sumPeriod(series, date, date);
      return { date, sold: num(f.roomsSold), occ: pct(f.occupancy), adr: money(f.adr), revpar: money(f.revpar), rooms: money(f.roomsRevenue), fb: money(f.fbRevenue), other: money(round2(f.otherRevenue + f.unclassifiedRevenue)), total: money(f.totalRevenue) };
    };
    const all = sumPeriod(series, p.from, p.to);
    return doc(
      REVENUE_BY_DEPARTMENT,
      ctx,
      rangeText(p),
      [
        {
          columns: [
            { key: "date", label: "Date", kind: "date" },
            { key: "sold", label: "Rooms sold", kind: "number" },
            { key: "occ", label: "Occupancy", kind: "percent" },
            { key: "adr", label: "ADR", kind: "money" },
            { key: "revpar", label: "RevPAR", kind: "money" },
            { key: "rooms", label: "Rooms revenue", kind: "money" },
            { key: "fb", label: "Food and beverage", kind: "money" },
            { key: "other", label: "Other", kind: "money" },
            { key: "total", label: "Total revenue", kind: "money" },
          ],
          rows: eachDate(p.from, p.to).map(row),
          totals: { date: "Total", sold: num(all.roomsSold), occ: pct(all.occupancy), adr: money(all.adr), revpar: money(all.revpar), rooms: money(all.roomsRevenue), fb: money(all.fbRevenue), other: money(round2(all.otherRevenue + all.unclassifiedRevenue)), total: money(all.totalRevenue) },
        },
      ],
      ["Worked out the same way as the manager's report: room revenue is each stay's room charge shared over its nights; other revenue is bill lines and walk-in outlet sales on the day posted."],
    );
  },
};

const ROOM_TYPES: ReportDef = {
  key: "room-types",
  title: "Room revenue by room type",
  description: "Room nights, room revenue and ADR for each room type, against its budget.",
  group: "Management",
  audience: "finance",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const [types, stays] = await Promise.all([loadRoomTypes(ctx.service, ctx.tenantId), loadStays(ctx.service, ctx.tenantId, p.from, p.to)]);
    // Budgets are read on their own so the report still opens before the budgets table has been added.
    let budgets = new Map<string, Map<string, number>>();
    let budgetsRead = true;
    try {
      budgets = await loadRoomTypeBudgets(ctx.service, ctx.tenantId, monthStart(p.from), monthStart(p.to));
    } catch {
      budgetsRead = false;
    }
    const dates = eachDate(p.from, p.to);
    const names = new Map(types.map((t) => [t.id, t.name]));
    const ids = [...types.map((t) => t.id), ...[...new Set(stays.map((s) => s.room_type_code ?? "").filter((c) => c && !names.has(c)))]];
    const rows = ids.map((id) => {
      let nights = 0;
      let revenue = 0;
      for (const v of nightsSold(stays.filter((s) => (s.room_type_code ?? "") === id), dates, ctx.today).values()) {
        nights += v.sold;
        revenue += v.revenue;
      }
      revenue = round2(revenue);
      const monthly = budgets.get(id);
      const budget = monthly && monthly.size > 0 ? proratedBudget(monthly, p.from, p.to) : null;
      return { id, name: names.get(id) ?? `${id} (no longer in room setup)`, nights, revenue, budget };
    });
    const totalNights = rows.reduce((s, r) => s + r.nights, 0);
    const totalRevenue = round2(rows.reduce((s, r) => s + r.revenue, 0));
    const anyBudget = rows.some((r) => r.budget != null);
    const totalBudget = anyBudget ? round2(rows.reduce((s, r) => s + (r.budget ?? 0), 0)) : null;
    const versus = (actual: number, budget: number | null) =>
      budget == null ? "No budget set" : `${actual - budget >= 0 ? "+" : ""}${Math.round(actual - budget).toLocaleString("en-GB")} (${budget > 0 ? Math.round((actual / budget) * 100) : 0}% of budget)`;
    return doc(
      ROOM_TYPES,
      ctx,
      rangeText(p),
      [
        {
          columns: [
            { key: "type", label: "Room type", kind: "text" },
            { key: "nights", label: "Room nights sold", kind: "number" },
            { key: "revenue", label: "Room revenue", kind: "money" },
            { key: "adr", label: "ADR", kind: "money" },
            { key: "budget", label: "Budget", kind: "text" },
            { key: "vs", label: "Against budget", kind: "text" },
          ],
          rows: rows.map((r) => ({ type: r.name, nights: num(r.nights), revenue: money(r.revenue), adr: money(r.nights > 0 ? round2(r.revenue / r.nights) : null), budget: r.budget == null ? "No budget set" : r.budget.toLocaleString("en-GB", { maximumFractionDigits: 0 }), vs: versus(r.revenue, r.budget) })),
          totals: rows.length ? { type: "Total", nights: num(totalNights), revenue: money(totalRevenue), adr: money(totalNights > 0 ? round2(totalRevenue / totalNights) : null), budget: totalBudget == null ? "No budget set" : totalBudget.toLocaleString("en-GB", { maximumFractionDigits: 0 }), vs: versus(totalRevenue, totalBudget) } : undefined,
          emptyMessage: "No room types are set up for this hotel.",
        },
      ],
      [
        "Room revenue is each stay's room charge after booking discounts, before tax, shared over its nights, the same way as the manager's report.",
        "Budgets are set in Accounts, Budgets, under Room type budgets, and spread evenly over the days of each month.",
        ...(budgetsRead ? [] : ["Room type budgets could not be read, so none are shown."]),
      ],
    );
  },
};

/* ---------- Sales ---------- */

const FB_SALES: ReportDef = {
  key: "fb-sales",
  title: "Food and beverage sales",
  description: "Closed restaurant, bar and room-service bills by outlet, by day and the best-selling items.",
  group: "Sales",
  audience: "finance",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const [orders, outlets] = await Promise.all([
      fetchAll<{ id: string; outlet_id: string; subtotal: number | string; settlement_method: string; closed_at: string }>((a, b) =>
        ctx.service
          .schema("hotel")
          .from("fb_orders")
          .select("id,outlet_id,subtotal,settlement_method,closed_at")
          .eq("tenant_id", ctx.tenantId)
          .eq("status", "closed")
          .gte("closed_at", hotelDayStart(p.from, ctx.timeZone))
          .lt("closed_at", hotelDayStart(addDays(p.to, 1), ctx.timeZone))
          .order("id", { ascending: true })
          .range(a, b),
      ),
      ctx.service.schema("hotel").from("fb_outlets").select("id,name").eq("tenant_id", ctx.tenantId),
    ]);
    const outletName = new Map((outlets.data ?? []).map((o) => [o.id as string, o.name as string]));
    const byOutlet = new Map<string, { orders: number; sales: number; room: number }>();
    const byDay = new Map<string, { orders: number; sales: number }>();
    for (const o of orders) {
      const sales = n(o.subtotal);
      const name = outletName.get(o.outlet_id) ?? "Outlet";
      const a = byOutlet.get(name) ?? { orders: 0, sales: 0, room: 0 };
      a.orders += 1;
      a.sales += sales;
      if (o.settlement_method === "room_charge") a.room += sales;
      byOutlet.set(name, a);
      const d = hotelDate(o.closed_at, ctx.timeZone);
      const day = byDay.get(d) ?? { orders: 0, sales: 0 };
      day.orders += 1;
      day.sales += sales;
      byDay.set(d, day);
    }
    const items = new Map<string, { qty: number; sales: number }>();
    for (let i = 0; i < orders.length; i += 200) {
      const lines = await fetchAll<{ name_snapshot: string; price_snapshot: number | string; quantity: number; kitchen_status: string }>((a, b) =>
        ctx.service
          .schema("hotel")
          .from("fb_order_items")
          .select("name_snapshot,price_snapshot,quantity,kitchen_status")
          .eq("tenant_id", ctx.tenantId)
          .in("order_id", orders.slice(i, i + 200).map((o) => o.id))
          .order("id", { ascending: true })
          .range(a, b),
      );
      for (const l of lines) {
        if (l.kitchen_status === "voided") continue;
        const it = items.get(l.name_snapshot) ?? { qty: 0, sales: 0 };
        it.qty += l.quantity;
        it.sales += n(l.price_snapshot) * l.quantity;
        items.set(l.name_snapshot, it);
      }
    }
    const total = orders.reduce((s, o) => s + n(o.subtotal), 0);
    return doc(
      FB_SALES,
      ctx,
      rangeText(p),
      [
        {
          title: "By outlet",
          columns: [
            { key: "outlet", label: "Outlet", kind: "text" },
            { key: "orders", label: "Bills", kind: "number" },
            { key: "avg", label: "Average bill", kind: "money" },
            { key: "room", label: "Charged to rooms", kind: "money" },
            { key: "sales", label: "Sales", kind: "money" },
          ],
          rows: [...byOutlet.entries()].sort((a, b) => b[1].sales - a[1].sales).map(([outlet, a]) => ({ outlet, orders: num(a.orders), avg: money(a.orders ? round2(a.sales / a.orders) : null), room: money(round2(a.room)), sales: money(round2(a.sales)) })),
          totals: orders.length ? { outlet: "Total", orders: num(orders.length), avg: money(round2(total / orders.length)), room: money(round2([...byOutlet.values()].reduce((s, a) => s + a.room, 0))), sales: money(round2(total)) } : undefined,
          emptyMessage: "No bills were closed in this period.",
        },
        {
          title: "By day",
          columns: [
            { key: "date", label: "Date", kind: "date" },
            { key: "orders", label: "Bills", kind: "number" },
            { key: "sales", label: "Sales", kind: "money" },
          ],
          rows: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, d]) => ({ date, orders: num(d.orders), sales: money(round2(d.sales)) })),
          emptyMessage: "No bills were closed in this period.",
        },
        {
          title: "Best-selling items (top 25)",
          columns: [
            { key: "item", label: "Item", kind: "text" },
            { key: "qty", label: "Sold", kind: "number" },
            { key: "sales", label: "Sales", kind: "money" },
          ],
          rows: [...items.entries()].sort((a, b) => b[1].sales - a[1].sales).slice(0, 25).map(([item, it]) => ({ item, qty: num(it.qty), sales: money(round2(it.sales)) })),
          emptyMessage: "No items were sold in this period.",
        },
      ],
      ["Sales are the subtotals of closed bills, including bills charged to a room. They are the outlets' own sales, so they will not match the revenue-by-department report, which counts room-charged bills on the guest's bill."],
    );
  },
};

const CANCELLATIONS: ReportDef = {
  key: "cancellations",
  title: "Cancellations and no-shows",
  description: "Bookings that did not happen, with the room revenue that was at stake.",
  group: "Sales",
  audience: "operations",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const rows = await listStays(ctx, { statuses: ["cancelled", "no_show"], arrival: spanRange(p.from, p.to) });
    const at = rows.reduce((s, r) => s + n(r.total_room_charges), 0);
    // The cancel date is read on its own so the report still opens if the column hasn't been added yet.
    const cancelledOn = new Map<string, string>();
    try {
      for (let i = 0; i < rows.length; i += 100) {
        const { data, error } = await ctx.service
          .schema("hotel")
          .from("reservations")
          .select("id,cancelled_at")
          .eq("tenant_id", ctx.tenantId)
          .in("id", rows.slice(i, i + 100).map((r) => r.id));
        if (error) throw error;
        for (const d of (data ?? []) as { id: string; cancelled_at: string | null }[]) if (d.cancelled_at) cancelledOn.set(d.id, hotelDate(d.cancelled_at, ctx.timeZone));
      }
    } catch {
      cancelledOn.clear();
    }
    const sourceLabel = (await optionLabelers(ctx)).source;
    return doc(CANCELLATIONS, ctx, `Arrivals ${rangeText(p)}`, [
      {
        columns: stayColumns([
          { key: "arrival", label: "Was due", kind: "date" },
          { key: "cancelledOn", label: "Cancelled on", kind: "text" },
          { key: "nights", label: "Nights", kind: "number" },
          { key: "source", label: "Booked through", kind: "text" },
          { key: "status", label: "What happened", kind: "text" },
          { key: "at", label: "Room revenue at stake", kind: "money" },
        ]),
        rows: rows.map((r) => ({ code: r.confirmation_code, guest: guestOf(r), room: roomOf(r), type: r.room_type_code, arrival: r.arrival_at.slice(0, 10), cancelledOn: cancelledOn.get(r.id) ?? "Not recorded", nights: num(r.nights), source: sourceLabel(r.source), status: STATUS_LABEL[r.status] ?? r.status, at: money(n(r.total_room_charges)) })),
        totals: rows.length ? { code: `${rows.length} booking${rows.length === 1 ? "" : "s"}`, nights: num(rows.reduce((s, r) => s + r.nights, 0)), at: money(round2(at)) } : undefined,
        emptyMessage: "No cancellations or no-shows in this period.",
      },
    ]);
  },
};

const PRODUCTION: ReportDef = {
  key: "production",
  title: "Production by source and segment",
  description: "Where bookings come from: stays, room nights and room revenue by how they were booked and by guest type.",
  group: "Sales",
  audience: "finance",
  period: "range",
  async build(ctx, params) {
    const p = clampParams(params);
    const rows = await listStays(ctx, { statuses: ["confirmed", "checked_in", "checked_out"], arrival: spanRange(p.from, p.to) });
    const totalRevenue = rows.reduce((s, r) => s + n(r.total_room_charges), 0);
    const label = await optionLabelers(ctx);
    // Grouped by the stored value, so two options with the same wording stay on separate lines.
    const group = (pick: (r: StayListRow) => { key: string; name: string }): ReportSection["rows"] => {
      const m = new Map<string, { name: string; stays: number; nights: number; revenue: number }>();
      for (const r of rows) {
        const { key: k, name } = pick(r);
        const v = m.get(k) ?? { name, stays: 0, nights: 0, revenue: 0 };
        v.stays += 1;
        v.nights += r.nights;
        v.revenue += n(r.total_room_charges);
        m.set(k, v);
      }
      return [...m.values()].sort((a, b) => b.revenue - a.revenue).map((v) => ({
        name: v.name,
        stays: num(v.stays),
        nights: num(v.nights),
        adr: money(v.nights ? round2(v.revenue / v.nights) : null),
        revenue: money(round2(v.revenue)),
        share: pct(totalRevenue > 0 ? Math.round((v.revenue / totalRevenue) * 1000) / 10 : null),
      }));
    };
    const cols = (first: string): ReportSection["columns"] => [
      { key: "name", label: first, kind: "text" },
      { key: "stays", label: "Stays", kind: "number" },
      { key: "nights", label: "Room nights", kind: "number" },
      { key: "adr", label: "Average rate", kind: "money" },
      { key: "revenue", label: "Room revenue", kind: "money" },
      { key: "share", label: "Share of revenue", kind: "percent" },
    ];
    return doc(
      PRODUCTION,
      ctx,
      `Arrivals ${rangeText(p)}`,
      [
        { title: "By source", columns: cols("Booked through"), rows: group((r) => ({ key: r.source, name: label.source(r.source) })), emptyMessage: "No bookings with arrivals in this period." },
        { title: "By segment", columns: cols("Guest type"), rows: group((r) => ({ key: r.market_segment, name: label.segment(r.market_segment) })), emptyMessage: "No bookings with arrivals in this period." },
      ],
      ["Room revenue is each booking's room charge after booking discounts, before tax, counted in the period the guest is due to arrive. Cancellations and no-shows are left out."],
    );
  },
};

/* ---------- Housekeeping ---------- */

const HOUSEKEEPING: ReportDef = {
  key: "housekeeping",
  title: "Housekeeping",
  description: "Where every room stands now, and today's cleaning figures by attendant.",
  group: "Housekeeping",
  audience: "operations",
  period: "none",
  async build(ctx) {
    const [rooms, report] = await Promise.all([
      ctx.service.schema("hotel").from("room_units").select("floor,status").eq("tenant_id", ctx.tenantId),
      getHousekeepingDailyReport(ctx.service, ctx.tenantId),
    ]);
    const STATUS: [string, string][] = [
      ["occupied", "Occupied"],
      ["vacant_clean", "Vacant and clean"],
      ["inspected", "Inspected"],
      ["dirty", "Dirty"],
      ["maintenance", "Maintenance"],
      ["out_of_order", "Out of order"],
    ];
    const byFloor = new Map<number, Record<string, number>>();
    for (const r of rooms.data ?? []) {
      const f = byFloor.get(r.floor as number) ?? {};
      f[r.status as string] = (f[r.status as string] ?? 0) + 1;
      byFloor.set(r.floor as number, f);
    }
    const floors = [...byFloor.entries()].sort(([a], [b]) => a - b);
    const sum = (key: string) => floors.reduce((s, [, f]) => s + (f[key] ?? 0), 0);
    return doc(
      HOUSEKEEPING,
      ctx,
      `Right now · ${formatLongDate(ctx.today)}`,
      [
        {
          title: "Room status by floor",
          columns: [{ key: "floor", label: "Floor", kind: "text" }, ...STATUS.map(([key, label]) => ({ key, label, kind: "number" as const })), { key: "all", label: "Rooms", kind: "number" as const }],
          rows: floors.map(([floor, f]) => ({ floor: floorLabelPlain(Number(floor)), ...Object.fromEntries(STATUS.map(([k]) => [k, num(f[k] ?? 0)])), all: num(Object.values(f).reduce((s, v) => s + v, 0)) })),
          totals: floors.length ? { floor: "All floors", ...Object.fromEntries(STATUS.map(([k]) => [k, num(sum(k))])), all: num(floors.reduce((s, [, f]) => s + Object.values(f).reduce((a, v) => a + v, 0), 0)) } : undefined,
          emptyMessage: "No rooms have been added yet.",
        },
        {
          title: "Today's cleaning",
          columns: [
            { key: "measure", label: "Measure", kind: "text" },
            { key: "value", label: "Today", kind: "text" },
          ],
          rows: [
            { measure: "Cleaning tasks created", value: String(report.tasksCreatedToday) },
            { measure: "Rooms made ready", value: String(report.tasksCompletedToday) },
            { measure: "Average clean time", value: report.averageCleanMinutes != null ? `${report.averageCleanMinutes} minutes` : "No cleans finished yet" },
            { measure: "Passed inspection first time", value: report.inspectionPassRate != null ? `${report.inspectionPassRate}%` : "No inspections yet" },
          ],
        },
        {
          title: "Rooms cleaned per attendant",
          columns: [
            { key: "name", label: "Attendant", kind: "text" },
            { key: "rooms", label: "Rooms cleaned", kind: "number" },
          ],
          rows: report.perAttendant.map((a) => ({ name: a.name, rooms: num(a.roomsCleaned) })),
          emptyMessage: "No rooms have been finished yet today.",
        },
      ],
    );
  },
};

const MANAGERS: ReportDef = {
  key: "managers",
  title: "Manager's daily report",
  description: "Occupancy, ADR, RevPAR and revenue by department for a day, the month and the year, against last year and budget.",
  group: "Management",
  audience: "finance",
  period: "day",
  async build(ctx, p) {
    return managersReportDocument(await getManagersReport(ctx.service, ctx.tenantId, p.date, ctx.currency));
  },
};

const FORECAST: ReportDef = {
  key: "forecast",
  title: "Forecast and booking pace",
  description: "Rooms on the books for the next 30, 60 and 90 days, pick-up, and pace against last year.",
  group: "Management",
  audience: "finance",
  period: "none",
  async build(ctx) {
    return forecastDocument(await getForecastReport(ctx.service, ctx.tenantId, ctx.currency));
  },
};

export const REPORTS: ReportDef[] = [
  MANAGERS,
  FORECAST,
  REVENUE_BY_DEPARTMENT,
  ROOM_TYPES,
  ARRIVALS,
  DEPARTURES,
  IN_HOUSE,
  HOUSEKEEPING,
  GUEST_LEDGER,
  CASHIER,
  TAX,
  FB_SALES,
  PRODUCTION,
  CANCELLATIONS,
];

export function getReportDef(key: string): ReportDef | null {
  return REPORTS.find((r) => r.key === key) ?? null;
}

export function reportsFor(caps: { canViewFinance: boolean; canViewOperations: boolean }): ReportDef[] {
  return REPORTS.filter((r) => (r.audience === "finance" ? caps.canViewFinance : caps.canViewOperations));
}

export async function buildReport(def: ReportDef, ctx: ReportContext, params: ReportParams): Promise<ReportDocument> {
  return def.build(ctx, params);
}
