import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { postJournalEntry, type JournalEntryLineInput } from "@/lib/hms/journal-entries";
import { addMonths, monthEndOf, monthStartOf } from "@/lib/hms/accounting-periods";

export type DepreciationMethod = "straight_line" | "declining_balance";

export const DEPRECIATION_METHOD_LABELS: Record<DepreciationMethod, string> = {
  straight_line: "Straight line",
  declining_balance: "Declining balance (double rate)",
};

const FIXED_ASSET_CODE = "1500";
const ACCUMULATED_CODE = "1590";
const EXPENSE_CODE = "5700";
const GAIN_CODE = "4300";
const LOSS_CODE = "5500";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export type AssetTerms = { cost: number; salvageValue: number; lifeMonths: number; method: DepreciationMethod };

/**
 * The depreciation for each month of the asset's life, first month first. The amounts always add
 * up to cost minus salvage exactly: straight line puts the rounding into the last month, and
 * declining balance (double rate) never takes the book value below salvage and writes off what
 * is left in the last month.
 */
export function buildSchedule(terms: AssetTerms): number[] {
  const depreciable = round2(terms.cost - terms.salvageValue);
  const life = terms.lifeMonths;
  if (depreciable <= 0 || life < 1) return [];
  const out: number[] = [];
  if (terms.method === "straight_line") {
    const base = round2(depreciable / life);
    for (let i = 0; i < life - 1; i++) out.push(base);
    out.push(round2(depreciable - base * (life - 1)));
    return out;
  }
  let remaining = depreciable;
  for (let i = 0; i < life; i++) {
    const book = remaining + terms.salvageValue;
    const amount = i === life - 1 ? remaining : Math.min(remaining, round2((book * 2) / life));
    out.push(round2(amount));
    remaining = round2(remaining - amount);
  }
  return out;
}

/** Months from the acquisition month to `month`; 0 is the month of purchase. */
export function monthIndex(acquisitionDate: string, month: string): number {
  const [ay, am] = acquisitionDate.split("-").map(Number);
  const [y, m] = month.split("-").map(Number);
  return (y - ay) * 12 + (m - am);
}

/** What the asset depreciates in `month`, or 0 before purchase and after the end of its life. */
export function depreciationForMonth(terms: AssetTerms & { acquisitionDate: string }, month: string): number {
  const idx = monthIndex(terms.acquisitionDate, month);
  if (idx < 0) return 0;
  return buildSchedule(terms)[idx] ?? 0;
}

export type DisposalResult = { lines: JournalEntryLineInput[]; gain: number };

/** Dr accumulated depreciation and proceeds, Cr cost, with the difference as a gain or a loss. */
export function buildDisposalLines(
  p: { cost: number; accumulated: number; proceeds: number },
  ids: { asset: string; accumulated: string; proceeds: string; gain: string; loss: string },
): DisposalResult {
  const bookValue = round2(p.cost - p.accumulated);
  const gain = round2(p.proceeds - bookValue);
  const lines: JournalEntryLineInput[] = [];
  if (p.accumulated > 0) lines.push({ accountId: ids.accumulated, debit: p.accumulated, credit: 0 });
  if (p.proceeds > 0) lines.push({ accountId: ids.proceeds, debit: p.proceeds, credit: 0 });
  if (gain < 0) lines.push({ accountId: ids.loss, debit: -gain, credit: 0 });
  lines.push({ accountId: ids.asset, debit: 0, credit: p.cost });
  if (gain > 0) lines.push({ accountId: ids.gain, debit: 0, credit: gain });
  return { lines, gain };
}

/** One month's depreciation journal: Dr expense and Cr accumulated depreciation for every asset due. */
export function buildDepreciationLines(
  due: { amount: number; department: string | null }[],
  accounts: { expense: string; accumulated: string },
): JournalEntryLineInput[] {
  return due.flatMap((d) => [
    { accountId: accounts.expense, department: d.department, debit: d.amount, credit: 0 },
    { accountId: accounts.accumulated, department: d.department, debit: 0, credit: d.amount },
  ]);
}

export type FixedAssetRow = {
  id: string;
  assetCode: string;
  name: string;
  category: string;
  acquisitionDate: string;
  cost: number;
  salvageValue: number;
  lifeMonths: number;
  method: DepreciationMethod;
  status: "active" | "disposed";
  department: string | null;
  accumulated: number;
  bookValue: number;
  lastDepreciatedMonth: string | null;
  disposedOn: string | null;
  disposalProceeds: number | null;
};

type AssetDbRow = {
  id: string;
  asset_code: string;
  name: string;
  category: string;
  acquisition_date: string;
  cost: number | string;
  salvage_value: number | string;
  life_months: number;
  method: DepreciationMethod;
  status: "active" | "disposed";
  department: string | null;
  disposed_on: string | null;
  disposal_proceeds: number | string | null;
};

export async function listFixedAssets(service: SupabaseClient, tenantId: string): Promise<FixedAssetRow[]> {
  const [{ data: assets, error }, { data: deps }] = await Promise.all([
    service
      .schema("hotel")
      .from("fixed_assets")
      .select("id,asset_code,name,category,acquisition_date,cost,salvage_value,life_months,method,status,department,disposed_on,disposal_proceeds")
      .eq("tenant_id", tenantId)
      .order("asset_code", { ascending: true }),
    service.schema("hotel").from("fixed_asset_depreciation").select("asset_id,period_month,amount").eq("tenant_id", tenantId),
  ]);
  if (error) throw new Error(error.message);
  const accumulated = new Map<string, number>();
  const last = new Map<string, string>();
  for (const d of deps ?? []) {
    const id = d.asset_id as string;
    accumulated.set(id, round2((accumulated.get(id) ?? 0) + Number(d.amount)));
    const m = d.period_month as string;
    if (!last.get(id) || m > (last.get(id) as string)) last.set(id, m);
  }
  return ((assets ?? []) as AssetDbRow[]).map((a) => {
    const acc = accumulated.get(a.id) ?? 0;
    return {
      id: a.id,
      assetCode: a.asset_code,
      name: a.name,
      category: a.category,
      acquisitionDate: a.acquisition_date,
      cost: Number(a.cost),
      salvageValue: Number(a.salvage_value),
      lifeMonths: a.life_months,
      method: a.method,
      status: a.status,
      department: a.department,
      accumulated: acc,
      bookValue: a.status === "disposed" ? 0 : round2(Number(a.cost) - acc),
      lastDepreciatedMonth: last.get(a.id) ?? null,
      disposedOn: a.disposed_on,
      disposalProceeds: a.disposal_proceeds === null ? null : Number(a.disposal_proceeds),
    };
  });
}

export async function createFixedAsset(
  service: SupabaseClient,
  params: {
    tenantId: string;
    actorUserId: string;
    name: string;
    category: string;
    acquisitionDate: string;
    cost: number;
    salvageValue: number;
    lifeMonths: number;
    method: DepreciationMethod;
    department?: string | null;
    notes?: string | null;
    /** When set, the purchase is posted now: Dr Fixed Assets, Cr this account (cash, bank or payables). */
    paidFromAccountId?: string | null;
  },
): Promise<{ ok: true; id: string; assetCode: string } | { ok: false; error: string }> {
  if (!params.name.trim()) return { ok: false, error: "Give the asset a name." };
  if (!(params.cost > 0)) return { ok: false, error: "Cost must be more than zero." };
  if (params.salvageValue < 0 || params.salvageValue >= params.cost) return { ok: false, error: "Salvage value must be less than the cost." };
  if (!Number.isInteger(params.lifeMonths) || params.lifeMonths < 1) return { ok: false, error: "Life must be at least one month." };

  const { count } = await service.schema("hotel").from("fixed_assets").select("id", { count: "exact", head: true }).eq("tenant_id", params.tenantId);
  const assetCode = `FA-${String((count ?? 0) + 1).padStart(4, "0")}`;

  let acquisitionEntryId: string | null = null;
  if (params.paidFromAccountId) {
    const assetAccount = await getAccountIdByCode(service, params.tenantId, FIXED_ASSET_CODE);
    if (!assetAccount) return { ok: false, error: "Fixed Assets (1500) is missing from the chart of accounts." };
    const posted = await postJournalEntry(service, {
      tenantId: params.tenantId,
      entryDate: params.acquisitionDate,
      memo: `Purchase of ${params.name.trim()} (${assetCode})`,
      reference: assetCode,
      createdBy: params.actorUserId,
      lines: [
        { accountId: assetAccount, department: params.department ?? null, debit: params.cost, credit: 0 },
        { accountId: params.paidFromAccountId, debit: 0, credit: params.cost },
      ],
    });
    if (!posted.ok) return posted;
    acquisitionEntryId = posted.id;
  }

  const { data, error } = await service
    .schema("hotel")
    .from("fixed_assets")
    .insert({
      tenant_id: params.tenantId,
      asset_code: assetCode,
      name: params.name.trim(),
      category: params.category.trim() || "Equipment",
      acquisition_date: params.acquisitionDate,
      cost: params.cost,
      salvage_value: params.salvageValue,
      life_months: params.lifeMonths,
      method: params.method,
      department: params.department ?? null,
      notes: params.notes ?? null,
      acquisition_journal_entry_id: acquisitionEntryId,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error) {
    if (acquisitionEntryId) await service.schema("hotel").from("journal_entries").delete().eq("id", acquisitionEntryId);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id as string, assetCode };
}

/**
 * Posts every missing month of depreciation up to and including `throughMonth`, one balanced
 * journal per month. Months already posted are skipped, so running it twice does nothing the
 * second time. Stops at the first month that cannot be posted (for example a closed month).
 */
export async function runDepreciation(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; throughMonth: string; today: string; assetId?: string },
): Promise<{ ok: true; monthsPosted: string[]; total: number } | { ok: false; error: string; monthsPosted: string[] }> {
  if (monthEndOf(params.throughMonth) >= params.today) {
    return { ok: false, error: "That month has not finished yet.", monthsPosted: [] };
  }
  const [expense, accumulatedAcct] = await Promise.all([
    getAccountIdByCode(service, params.tenantId, EXPENSE_CODE),
    getAccountIdByCode(service, params.tenantId, ACCUMULATED_CODE),
  ]);
  if (!expense || !accumulatedAcct) {
    return { ok: false, error: "Depreciation Expense (5700) and Accumulated Depreciation (1590) must be in the chart of accounts.", monthsPosted: [] };
  }

  let assetsQuery = service
    .schema("hotel")
    .from("fixed_assets")
    .select("id,acquisition_date,cost,salvage_value,life_months,method,department")
    .eq("tenant_id", params.tenantId)
    .eq("status", "active");
  if (params.assetId) assetsQuery = assetsQuery.eq("id", params.assetId);
  const [{ data: assets }, { data: deps }] = await Promise.all([
    assetsQuery,
    service.schema("hotel").from("fixed_asset_depreciation").select("asset_id,period_month").eq("tenant_id", params.tenantId),
  ]);
  const done = new Set((deps ?? []).map((d) => `${d.asset_id}|${d.period_month}`));
  const list = (assets ?? []).map((a) => ({
    id: a.id as string,
    acquisitionDate: a.acquisition_date as string,
    cost: Number(a.cost),
    salvageValue: Number(a.salvage_value),
    lifeMonths: a.life_months as number,
    method: a.method as DepreciationMethod,
    department: (a.department as string | null) ?? null,
  }));
  if (list.length === 0) return { ok: true, monthsPosted: [], total: 0 };

  const first = list.map((a) => monthStartOf(a.acquisitionDate)).sort()[0];
  const monthsPosted: string[] = [];
  let total = 0;
  for (let month = first; month <= params.throughMonth; month = addMonths(month, 1)) {
    const due = list
      .filter((a) => !done.has(`${a.id}|${month}`))
      .map((a) => ({ asset: a, amount: depreciationForMonth(a, month) }))
      .filter((d) => d.amount > 0);
    if (due.length === 0) continue;

    const lines = buildDepreciationLines(
      due.map((d) => ({ amount: d.amount, department: d.asset.department })),
      { expense, accumulated: accumulatedAcct },
    );
    const posted = await postJournalEntry(service, {
      tenantId: params.tenantId,
      entryDate: monthEndOf(month),
      memo: `Depreciation for ${month.slice(0, 7)}`,
      reference: `depreciation-${month.slice(0, 7)}`,
      createdBy: params.actorUserId,
      lines,
    });
    if (!posted.ok) return { ok: false, error: `${month.slice(0, 7)}: ${posted.error}`, monthsPosted };

    const { error } = await service.schema("hotel").from("fixed_asset_depreciation").insert(
      due.map((d) => ({
        tenant_id: params.tenantId,
        asset_id: d.asset.id,
        period_month: month,
        amount: d.amount,
        journal_entry_id: posted.id,
      })),
    );
    if (error) {
      await service.schema("hotel").from("journal_entries").delete().eq("id", posted.id);
      return { ok: false, error: error.message, monthsPosted };
    }
    monthsPosted.push(month);
    total = round2(total + due.reduce((s, d) => s + d.amount, 0));
  }
  return { ok: true, monthsPosted, total };
}

export async function disposeFixedAsset(
  service: SupabaseClient,
  params: {
    tenantId: string;
    actorUserId: string;
    assetId: string;
    disposedOn: string;
    proceeds: number;
    /** Where the money went (cash or bank); ignored when proceeds are zero. */
    proceedsAccountId?: string | null;
    today: string;
  },
): Promise<{ ok: true; gain: number } | { ok: false; error: string }> {
  if (params.proceeds < 0) return { ok: false, error: "Proceeds cannot be negative." };

  const { data: asset } = await service
    .schema("hotel")
    .from("fixed_assets")
    .select("id,name,asset_code,acquisition_date,cost,status,department")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.assetId)
    .maybeSingle();
  if (!asset) return { ok: false, error: "Asset not found." };
  if (asset.status === "disposed") return { ok: false, error: "That asset is already disposed of." };
  if (params.disposedOn < (asset.acquisition_date as string)) return { ok: false, error: "It cannot be disposed of before it was bought." };
  if (params.disposedOn > params.today) return { ok: false, error: "The disposal date cannot be in the future." };

  // Depreciation up to the month before disposal is posted first; no depreciation in the month of disposal.
  const previousMonth = addMonths(monthStartOf(params.disposedOn), -1);
  const catchUp =
    monthEndOf(previousMonth) < params.today
      ? await runDepreciation(service, {
          tenantId: params.tenantId,
          actorUserId: params.actorUserId,
          throughMonth: previousMonth,
          today: params.today,
          assetId: params.assetId,
        })
      : null;
  if (catchUp && !catchUp.ok) return { ok: false, error: `Could not catch up depreciation first. ${catchUp.error}` };

  const [assetAcct, accumulatedAcct, gainAcct, lossAcct, cashAcct, { data: deps }] = await Promise.all([
    getAccountIdByCode(service, params.tenantId, FIXED_ASSET_CODE),
    getAccountIdByCode(service, params.tenantId, ACCUMULATED_CODE),
    getAccountIdByCode(service, params.tenantId, GAIN_CODE),
    getAccountIdByCode(service, params.tenantId, LOSS_CODE),
    params.proceedsAccountId ? Promise.resolve(params.proceedsAccountId) : getAccountIdByCode(service, params.tenantId, "1000"),
    service
      .schema("hotel")
      .from("fixed_asset_depreciation")
      .select("amount")
      .eq("tenant_id", params.tenantId)
      .eq("asset_id", params.assetId),
  ]);
  if (!assetAcct || !accumulatedAcct || !gainAcct || !lossAcct || !cashAcct) {
    return { ok: false, error: "The chart of accounts is missing 1500, 1590, 4300, 5500 or the proceeds account." };
  }

  const accumulated = round2((deps ?? []).reduce((s, d) => s + Number(d.amount), 0));
  const { lines, gain } = buildDisposalLines(
    { cost: Number(asset.cost), accumulated, proceeds: params.proceeds },
    { asset: assetAcct, accumulated: accumulatedAcct, proceeds: cashAcct, gain: gainAcct, loss: lossAcct },
  );
  const withDept = lines.map((l) => ({ ...l, department: (asset.department as string | null) ?? null }));

  const posted = await postJournalEntry(service, {
    tenantId: params.tenantId,
    entryDate: params.disposedOn,
    memo: `Disposal of ${asset.name} (${asset.asset_code})`,
    reference: asset.asset_code as string,
    createdBy: params.actorUserId,
    lines: withDept,
  });
  if (!posted.ok) return posted;

  const { error } = await service
    .schema("hotel")
    .from("fixed_assets")
    .update({
      status: "disposed",
      disposed_on: params.disposedOn,
      disposal_proceeds: params.proceeds,
      disposal_journal_entry_id: posted.id,
    })
    .eq("id", params.assetId);
  if (error) {
    await service.schema("hotel").from("journal_entries").delete().eq("id", posted.id);
    return { ok: false, error: error.message };
  }
  return { ok: true, gain };
}
