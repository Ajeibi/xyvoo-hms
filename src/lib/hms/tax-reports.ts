import type { SupabaseClient } from "@supabase/supabase-js";
import { stayLinePart, type FolioLineRow } from "@/lib/hms/folio";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const DEFAULT_WHT_RATE = 5;

export type TaxFolioLine = Pick<FolioLineRow, "metadata" | "reference" | "description"> & {
  kind: string;
  amount: number | string;
  created_at: string;
};

export type TaxBillLine = {
  bill_date: string;
  subtotal: number | string;
  tax: number | string;
  fx_rate: number | string | null;
};

export type TaxMonth = {
  month: string;
  vatCollected: number;
  stateLevy: number;
  stampLevy: number;
  /** VAT, state levy and stamp levy together: what was collected for the government. */
  collectedTotal: number;
  inputVat: number;
  /** Output VAT less input VAT on vendor bills; negative means a refund position. */
  vatPayable: number;
  withholdingBase: number;
  withholdingTax: number;
  /** Credits to Taxes Payable (2200) in the journals for the month, to compare with collectedTotal. */
  ledgerCredits: number;
};

const emptyMonth = (month: string): TaxMonth => ({
  month,
  vatCollected: 0,
  stateLevy: 0,
  stampLevy: 0,
  collectedTotal: 0,
  inputVat: 0,
  vatPayable: 0,
  withholdingBase: 0,
  withholdingTax: 0,
  ledgerCredits: 0,
});

/** Builds the twelve months of a year from folio tax lines and approved vendor bills. */
export function buildTaxYear(
  year: number,
  folioLines: TaxFolioLine[],
  bills: TaxBillLine[],
  whtRate: number,
  ledgerCreditsByMonth: Map<string, number> = new Map(),
): TaxMonth[] {
  const months = Array.from({ length: 12 }, (_, i) => emptyMonth(`${year}-${String(i + 1).padStart(2, "0")}-01`));
  const at = (date: string) => months[Number(date.slice(5, 7)) - 1];

  for (const l of folioLines) {
    if (l.kind !== "charge" && l.kind !== "discount") continue;
    if (!l.created_at.startsWith(String(year))) continue;
    const m = at(l.created_at);
    const sign = l.kind === "charge" ? 1 : -1;
    const amount = Math.abs(Number(l.amount) || 0) * sign;
    const part = stayLinePart(l);
    if (part === "vat") m.vatCollected += amount;
    else if (part === "state_levy") m.stateLevy += amount;
    else if (part === "stamp_levy") m.stampLevy += amount;
  }

  for (const b of bills) {
    if (!b.bill_date.startsWith(String(year))) continue;
    const m = at(b.bill_date);
    const fx = Number(b.fx_rate) || 1;
    m.inputVat += (Number(b.tax) || 0) * fx;
    m.withholdingBase += (Number(b.subtotal) || 0) * fx;
  }

  for (const m of months) {
    m.vatCollected = round2(m.vatCollected);
    m.stateLevy = round2(m.stateLevy);
    m.stampLevy = round2(m.stampLevy);
    m.collectedTotal = round2(m.vatCollected + m.stateLevy + m.stampLevy);
    m.inputVat = round2(m.inputVat);
    m.vatPayable = round2(m.vatCollected - m.inputVat);
    m.withholdingBase = round2(m.withholdingBase);
    m.withholdingTax = round2((m.withholdingBase * whtRate) / 100);
    m.ledgerCredits = round2(ledgerCreditsByMonth.get(m.month) ?? 0);
  }
  return months;
}

export function sumTaxMonths(months: TaxMonth[]): Omit<TaxMonth, "month"> {
  const total = emptyMonth("total");
  for (const m of months) {
    for (const k of Object.keys(total) as (keyof TaxMonth)[]) {
      if (k !== "month") (total[k] as number) = round2((total[k] as number) + (m[k] as number));
    }
  }
  const { month: _ignored, ...rest } = total;
  void _ignored;
  return rest;
}

export async function getWhtRate(service: SupabaseClient, tenantId: string): Promise<number> {
  const { data } = await service.schema("hotel").from("tax_settings").select("wht_rate").eq("tenant_id", tenantId).maybeSingle();
  return data ? Number(data.wht_rate) : DEFAULT_WHT_RATE;
}

export async function saveWhtRate(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; rate: number },
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(params.rate >= 0 && params.rate <= 100)) return { ok: false, error: "The rate must be between 0 and 100." };
  const { error } = await service
    .schema("hotel")
    .from("tax_settings")
    .upsert({ tenant_id: params.tenantId, wht_rate: params.rate, updated_by: params.actorUserId, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  return error ? { ok: false, error: error.message } : { ok: true };
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export async function getTaxYear(
  service: SupabaseClient,
  tenantId: string,
  year: number,
): Promise<{ months: TaxMonth[]; totals: Omit<TaxMonth, "month">; whtRate: number }> {
  const start = `${year}-01-01T00:00:00Z`;
  const end = `${year + 1}-01-01T00:00:00Z`;
  const [whtRate, taxesPayable] = await Promise.all([getWhtRate(service, tenantId), getAccountIdByCode(service, tenantId, "2200")]);

  const [folio, bills, credits] = await Promise.all([
    fetchAll<TaxFolioLine>((from, to) =>
      service
        .schema("hotel")
        .from("folio_transactions")
        .select("kind,amount,metadata,reference,description,created_at")
        .eq("tenant_id", tenantId)
        .eq("department", "rooms")
        .in("kind", ["charge", "discount"])
        .is("voided_at", null)
        .gte("created_at", start)
        .lt("created_at", end)
        .range(from, to) as unknown as PromiseLike<{ data: TaxFolioLine[] | null }>,
    ),
    fetchAll<TaxBillLine>((from, to) =>
      service
        .schema("hotel")
        .from("vendor_bills")
        .select("bill_date,subtotal,tax,fx_rate")
        .eq("tenant_id", tenantId)
        .in("status", ["approved", "paid"])
        .gte("bill_date", `${year}-01-01`)
        .lte("bill_date", `${year}-12-31`)
        .range(from, to) as unknown as PromiseLike<{ data: TaxBillLine[] | null }>,
    ),
    taxesPayable
      ? fetchAll<{ credit: number; journal_entries: { entry_date: string } | { entry_date: string }[] | null }>((from, to) =>
          service
            .schema("hotel")
            .from("journal_entry_lines")
            .select("credit,journal_entries!inner(entry_date)")
            .eq("tenant_id", tenantId)
            .eq("account_id", taxesPayable)
            .gt("credit", 0)
            .gte("journal_entries.entry_date", `${year}-01-01`)
            .lte("journal_entries.entry_date", `${year}-12-31`)
            .range(from, to) as unknown as PromiseLike<{ data: { credit: number; journal_entries: { entry_date: string } | { entry_date: string }[] | null }[] | null }>,
        )
      : Promise.resolve([]),
  ]);

  const byMonth = new Map<string, number>();
  for (const c of credits) {
    const e = Array.isArray(c.journal_entries) ? c.journal_entries[0] : c.journal_entries;
    if (!e) continue;
    const key = `${e.entry_date.slice(0, 7)}-01`;
    byMonth.set(key, (byMonth.get(key) ?? 0) + Number(c.credit));
  }

  const months = buildTaxYear(year, folio, bills, whtRate, byMonth);
  return { months, totals: sumTaxMonths(months), whtRate };
}
