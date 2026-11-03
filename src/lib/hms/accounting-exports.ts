import type { SupabaseClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { toCsv, type CsvCell } from "@/lib/csv";
import type { TrialBalanceRow } from "@/lib/hms/journal-entries";

export type ExportJournalLine = {
  entryId: string;
  entryDate: string;
  memo: string;
  reference: string | null;
  accountCode: string;
  accountName: string;
  department: string | null;
  description: string | null;
  debit: number;
  credit: number;
};

export type ExportType = "trial-balance" | "journal";
export type ExportFormat = "csv" | "xlsx" | "quickbooks" | "sage";

export const EXPORT_FORMATS_BY_TYPE: Record<ExportType, ExportFormat[]> = {
  "trial-balance": ["csv", "xlsx"],
  journal: ["csv", "xlsx", "quickbooks", "sage"],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function trialBalanceRows(rows: TrialBalanceRow[]): CsvCell[][] {
  const out: CsvCell[][] = [["Code", "Account", "Type", "Debit", "Credit", "Balance"]];
  for (const r of rows) out.push([r.code, r.name, r.type, round2(r.debit), round2(r.credit), round2(r.balance)]);
  const d = round2(rows.reduce((s, r) => s + r.debit, 0));
  const c = round2(rows.reduce((s, r) => s + r.credit, 0));
  out.push(["", "Total", "", d, c, ""]);
  return out;
}

export function journalRows(lines: ExportJournalLine[]): CsvCell[][] {
  const out: CsvCell[][] = [["Date", "Entry", "Reference", "Memo", "Account code", "Account", "Department", "Line description", "Debit", "Credit"]];
  for (const l of lines) out.push([l.entryDate, l.entryId.slice(0, 8), l.reference, l.memo, l.accountCode, l.accountName, l.department, l.description, l.debit || "", l.credit || ""]);
  return out;
}

/** QuickBooks Online "journal entries" CSV import: one numbered journal per entry, debits and credits side by side. */
export function quickbooksRows(lines: ExportJournalLine[]): CsvCell[][] {
  const numbers = new Map<string, number>();
  const out: CsvCell[][] = [["JournalNo", "JournalDate", "AccountName", "Debits", "Credits", "Description", "Name", "Class"]];
  for (const l of lines) {
    if (!numbers.has(l.entryId)) numbers.set(l.entryId, numbers.size + 1);
    const [y, m, d] = l.entryDate.split("-");
    out.push([numbers.get(l.entryId), `${m}/${d}/${y}`, `${l.accountCode} ${l.accountName}`, l.debit || "", l.credit || "", l.description || l.memo, "", l.department ?? ""]);
  }
  return out;
}

/** Sage 50 Accounts journal import: JD for a debit and JC for a credit, nominal code, DD/MM/YYYY date. */
export function sageRows(lines: ExportJournalLine[]): CsvCell[][] {
  const out: CsvCell[][] = [["Type", "Nominal A/C Ref", "Department", "Date", "Reference", "Details", "Net Amount", "Tax Code", "Tax Amount"]];
  for (const l of lines) {
    const [y, m, d] = l.entryDate.split("-");
    const debit = l.debit > 0;
    out.push([debit ? "JD" : "JC", l.accountCode, "", `${d}/${m}/${y}`, l.reference || l.entryId.slice(0, 8), l.description || l.memo, debit ? l.debit : l.credit, "T9", 0]);
  }
  return out;
}

export async function rowsToXlsx(sheetName: string, rows: CsvCell[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName.slice(0, 31));
  for (const r of rows) ws.addRow(r.map((c) => (c === null || c === undefined ? "" : c)));
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => {
    let width = 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      width = Math.max(width, Math.min(48, String(cell.value ?? "").length + 2));
    });
    col.width = width;
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function buildCsv(rows: CsvCell[][]): string {
  return `﻿${toCsv(rows)}`;
}

/** Every journal line dated in the range, oldest first, paged so a long year is not cut at 1000 rows. */
export async function getJournalLinesForExport(
  service: SupabaseClient,
  tenantId: string,
  params: { dateFrom: string; dateTo: string },
): Promise<ExportJournalLine[]> {
  type Raw = {
    debit: number;
    credit: number;
    department: string | null;
    description: string | null;
    line_no: number;
    journal_entries: { id: string; entry_date: string; memo: string; reference: string | null } | { id: string; entry_date: string; memo: string; reference: string | null }[];
    chart_of_accounts: { code: string; name: string } | { code: string; name: string }[];
  };
  const out: ExportJournalLine[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await service
      .schema("hotel")
      .from("journal_entry_lines")
      .select("debit,credit,department,description,line_no,journal_entries!inner(id,entry_date,memo,reference),chart_of_accounts(code,name)")
      .eq("tenant_id", tenantId)
      .gte("journal_entries.entry_date", params.dateFrom)
      .lte("journal_entries.entry_date", params.dateTo)
      .order("id", { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    for (const r of (data ?? []) as unknown as Raw[]) {
      const e = Array.isArray(r.journal_entries) ? r.journal_entries[0] : r.journal_entries;
      const a = Array.isArray(r.chart_of_accounts) ? r.chart_of_accounts[0] : r.chart_of_accounts;
      out.push({
        entryId: e.id,
        entryDate: e.entry_date,
        memo: e.memo,
        reference: e.reference,
        accountCode: a?.code ?? "",
        accountName: a?.name ?? "",
        department: r.department,
        description: r.description,
        debit: Number(r.debit) || 0,
        credit: Number(r.credit) || 0,
      });
    }
    if (!data || data.length < 1000) break;
  }
  return out.sort((a, b) => a.entryDate.localeCompare(b.entryDate) || a.entryId.localeCompare(b.entryId));
}
