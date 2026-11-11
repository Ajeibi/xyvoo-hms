/*
 * Consolidating hotels' books into group statements. Pure (unit-tested): it takes each hotel's trial
 * balance lines and returns the group trial balance, P&L and balance sheet, with a column per hotel,
 * an eliminations column for inter-company accounts, and the group total.
 *
 * Accounts are matched by code (every hotel starts from the same chart). Where two hotels use one
 * code for differently named accounts, the statement says so instead of hiding it.
 */

export type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

export type TrialBalanceLine = {
  tenantId: string;
  code: string;
  name: string;
  type: AccountType;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type ConsolidatedRow = {
  code: string;
  name: string;
  type: AccountType;
  /** Natural-sign amount per hotel: debit-positive for assets and expenses, credit-positive otherwise. */
  byHotel: Record<string, number>;
  eliminations: number;
  total: number;
  nameMismatch: string[];
  interCompany: boolean;
};

export type Consolidation = {
  hotelIds: string[];
  trialBalance: ConsolidatedRow[];
  profitAndLoss: { revenue: ConsolidatedRow[]; expenses: ConsolidatedRow[]; netByHotel: Record<string, number>; netEliminations: number; netTotal: number };
  balanceSheet: {
    assets: ConsolidatedRow[];
    liabilities: ConsolidatedRow[];
    equity: ConsolidatedRow[];
    /** Profit not yet closed into equity, up to the date (all revenue less all expenses to date). */
    currentEarningsByHotel: Record<string, number>;
    currentEarningsTotal: number;
    /** Assets less liabilities, equity and current earnings; 0 when the books balance. */
    differenceByHotel: Record<string, number>;
    differenceTotal: number;
  };
  /** Inter-company accounts whose balances don't cancel out across the group (should be 0). */
  interCompanyMismatch: number;
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function natural(type: AccountType, debit: number, credit: number) {
  return type === "asset" || type === "expense" ? debit - credit : credit - debit;
}

const ORDER: Record<AccountType, number> = { asset: 1, liability: 2, equity: 3, revenue: 4, expense: 5 };

function build(
  lines: TrialBalanceLine[],
  hotelIds: string[],
  pick: (l: TrialBalanceLine) => [number, number],
  isInterCompany: (tenantId: string, code: string) => boolean,
  types?: AccountType[],
): ConsolidatedRow[] {
  const rows = new Map<string, ConsolidatedRow & { names: Map<string, string> }>();
  for (const l of lines) {
    if (types && !types.includes(l.type)) continue;
    const [d, c] = pick(l);
    const key = `${l.code}`;
    let row = rows.get(key);
    if (!row) {
      row = { code: l.code, name: l.name, type: l.type, byHotel: {}, eliminations: 0, total: 0, nameMismatch: [], interCompany: false, names: new Map() };
      for (const id of hotelIds) row.byHotel[id] = 0;
      rows.set(key, row);
    }
    const amount = natural(row.type, d, c);
    row.byHotel[l.tenantId] = round2((row.byHotel[l.tenantId] ?? 0) + amount);
    row.names.set(l.tenantId, l.name);
    if (isInterCompany(l.tenantId, l.code)) {
      row.interCompany = true;
      row.eliminations = round2(row.eliminations - amount);
    }
  }
  const out: ConsolidatedRow[] = [];
  for (const row of rows.values()) {
    const distinct = new Set([...row.names.values()].map((n) => n.trim().toLowerCase()));
    const nameMismatch = distinct.size > 1 ? [...row.names.values()] : [];
    const sumHotels = Object.values(row.byHotel).reduce((s, v) => s + v, 0);
    out.push({ code: row.code, name: row.name, type: row.type, byHotel: row.byHotel, eliminations: row.eliminations, total: round2(sumHotels + row.eliminations), nameMismatch, interCompany: row.interCompany });
  }
  return out
    .filter((r) => Object.values(r.byHotel).some((v) => v !== 0) || r.eliminations !== 0)
    .sort((a, b) => ORDER[a.type] - ORDER[b.type] || a.code.localeCompare(b.code, undefined, { numeric: true }));
}

function sumBy(rows: ConsolidatedRow[], hotelIds: string[]) {
  const by: Record<string, number> = {};
  for (const id of hotelIds) by[id] = round2(rows.reduce((s, r) => s + (r.byHotel[id] ?? 0), 0));
  return { by, elim: round2(rows.reduce((s, r) => s + r.eliminations, 0)), total: round2(rows.reduce((s, r) => s + r.total, 0)) };
}

export function consolidate(lines: TrialBalanceLine[], hotelIds: string[], interCompany: Array<{ tenantId: string; code: string }>): Consolidation {
  const ic = new Set(interCompany.map((x) => `${x.tenantId}|${x.code}`));
  const isIc = (t: string, code: string) => ic.has(`${t}|${code}`);
  const period = (l: TrialBalanceLine): [number, number] => [l.periodDebit, l.periodCredit];
  const closing = (l: TrialBalanceLine): [number, number] => [l.closingDebit, l.closingCredit];

  const trialBalance = build(lines, hotelIds, closing, isIc);
  const revenue = build(lines, hotelIds, period, isIc, ["revenue"]);
  const expenses = build(lines, hotelIds, period, isIc, ["expense"]);
  const rev = sumBy(revenue, hotelIds);
  const exp = sumBy(expenses, hotelIds);
  const netByHotel: Record<string, number> = {};
  for (const id of hotelIds) netByHotel[id] = round2(rev.by[id] - exp.by[id]);

  const assets = build(lines, hotelIds, closing, isIc, ["asset"]);
  const liabilities = build(lines, hotelIds, closing, isIc, ["liability"]);
  const equity = build(lines, hotelIds, closing, isIc, ["equity"]);
  const revToDate = sumBy(build(lines, hotelIds, closing, isIc, ["revenue"]), hotelIds);
  const expToDate = sumBy(build(lines, hotelIds, closing, isIc, ["expense"]), hotelIds);
  const a = sumBy(assets, hotelIds);
  const li = sumBy(liabilities, hotelIds);
  const eq = sumBy(equity, hotelIds);
  const currentEarningsByHotel: Record<string, number> = {};
  const differenceByHotel: Record<string, number> = {};
  for (const id of hotelIds) {
    currentEarningsByHotel[id] = round2(revToDate.by[id] - expToDate.by[id]);
    differenceByHotel[id] = round2(a.by[id] - li.by[id] - eq.by[id] - currentEarningsByHotel[id]);
  }
  const currentEarningsTotal = round2(revToDate.total - expToDate.total);

  // Inter-company balances should cancel: the sum of every inter-company account's own balance
  // (debit-positive) across the group is what doesn't match.
  const interCompanyMismatch = round2(
    trialBalance
      .filter((r) => r.interCompany)
      .reduce((s, r) => {
        const debitPositive = r.type === "asset" || r.type === "expense" ? 1 : -1;
        return s + debitPositive * Object.values(r.byHotel).reduce((x, v) => x + v, 0);
      }, 0),
  );

  return {
    hotelIds,
    trialBalance,
    profitAndLoss: { revenue, expenses, netByHotel, netEliminations: round2(rev.elim - exp.elim), netTotal: round2(rev.total - exp.total) },
    balanceSheet: {
      assets,
      liabilities,
      equity,
      currentEarningsByHotel,
      currentEarningsTotal,
      differenceByHotel,
      differenceTotal: round2(a.total - li.total - eq.total - currentEarningsTotal),
    },
    interCompanyMismatch,
  };
}

/** Which months in the range every hotel has closed; the statement is only final when all have. */
export function periodStatus(months: string[], closedByHotel: Record<string, string[]>, hotelNames: Record<string, string>) {
  return months.map((month) => {
    const open = Object.keys(hotelNames).filter((id) => !(closedByHotel[id] ?? []).includes(month));
    return { month, final: open.length === 0, openAt: open.map((id) => hotelNames[id]) };
  });
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function monthLabel(month: string) {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function monthIndex(month: string) {
  const [y, m] = month.slice(0, 7).split("-").map(Number);
  return y * 12 + m;
}

/** "Firefly (Jan 2026 to Nov 2026), Lagos (Nov 2026)": open months per hotel, runs of months joined. */
export function openMonthsByHotel(open: { month: string; openAt: string[] }[]) {
  const byHotel = new Map<string, string[]>();
  for (const p of open) for (const name of p.openAt) byHotel.set(name, [...(byHotel.get(name) ?? []), p.month]);
  return [...byHotel.entries()]
    .map(([name, months]) => {
      const sorted = [...months].sort();
      const runs: string[][] = [];
      for (const m of sorted) {
        const run = runs[runs.length - 1];
        if (run && monthIndex(m) === monthIndex(run[run.length - 1]) + 1) run.push(m);
        else runs.push([m]);
      }
      const text = runs.map((r) => (r.length === 1 ? monthLabel(r[0]) : `${monthLabel(r[0])} to ${monthLabel(r[r.length - 1])}`)).join(", ");
      return `${name} (${text})`;
    })
    .join("; ");
}
