import { describe, expect, it } from "vitest";
import { parseBankStatementCsv } from "./bank-statement-import";

describe("parseBankStatementCsv", () => {
  it("parses a single signed Amount column", () => {
    const csv = "Date,Description,Amount\n2026-09-01,Room revenue deposit,500.00\n2026-09-02,Utility payment,-120.50\n";
    const result = parseBankStatementCsv(csv);
    expect(result.skipped).toHaveLength(0);
    expect(result.rows).toEqual([
      { lineDate: "2026-09-01", description: "Room revenue deposit", amount: 500, reference: null },
      { lineDate: "2026-09-02", description: "Utility payment", amount: -120.5, reference: null },
    ]);
  });

  it("combines separate Debit/Credit columns into one signed amount", () => {
    const csv = "Date,Description,Debit,Credit\n2026-09-01,Deposit,,500.00\n2026-09-02,Withdrawal,120.50,\n";
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toEqual([
      { lineDate: "2026-09-01", description: "Deposit", amount: 500, reference: null },
      { lineDate: "2026-09-02", description: "Withdrawal", amount: -120.5, reference: null },
    ]);
  });

  it("recognizes common header name variants and picks up a reference column", () => {
    const csv = "Transaction Date,Memo,Money In,Money Out,Check Number\n2026-09-01,Deposit,300,,1042\n";
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toEqual([{ lineDate: "2026-09-01", description: "Deposit", amount: 300, reference: "1042" }]);
  });

  it("strips currency symbols and thousands separators", () => {
    const csv = "Date,Description,Amount\n2026-09-01,Big deposit,\"$1,234.56\"\n";
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toEqual([{ lineDate: "2026-09-01", description: "Big deposit", amount: 1234.56, reference: null }]);
  });

  it("skips rows missing a readable date or amount, reporting why", () => {
    const csv = "Date,Description,Amount\n,Missing date,100\n2026-09-01,Missing amount,\n2026-09-02,Good row,50\n";
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].description).toBe("Good row");
    expect(result.skipped).toEqual([
      { row: 2, reason: "Missing or unreadable date." },
      { row: 3, reason: "Missing or unreadable amount." },
    ]);
  });

  it("defaults to a placeholder description when none of the recognized columns are present", () => {
    const csv = "Date,Amount\n2026-09-01,100\n";
    const result = parseBankStatementCsv(csv);
    expect(result.rows).toEqual([{ lineDate: "2026-09-01", description: "(no description)", amount: 100, reference: null }]);
  });
});
