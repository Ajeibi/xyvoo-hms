import { describe, expect, it } from "vitest";
import { createAccount, isDebitNormal, seedHospitalityChartOfAccounts } from "./chart-of-accounts";

function makeChain(response: { data: unknown; error: unknown }) {
  const inserted: unknown[] = [];
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    insert: (payload: unknown) => {
      inserted.push(payload);
      return chain;
    },
    single: () => Promise.resolve(response),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
    __inserted: inserted,
  };
  return chain;
}

function makeService(responsesByTable: Record<string, { data: unknown; error: unknown }>) {
  const chainsByTable: Record<string, ReturnType<typeof makeChain>> = {};
  for (const [table, response] of Object.entries(responsesByTable)) {
    chainsByTable[table] = makeChain(response);
  }
  return {
    service: {
      schema: () => ({
        from: (table: string) => chainsByTable[table] ?? makeChain({ data: null, error: null }),
      }),
    } as unknown as import("@supabase/supabase-js").SupabaseClient,
    chainsByTable,
  };
}

describe("isDebitNormal", () => {
  it("is true for asset and expense accounts", () => {
    expect(isDebitNormal("asset")).toBe(true);
    expect(isDebitNormal("expense")).toBe(true);
  });

  it("is false for liability, equity, and revenue accounts", () => {
    expect(isDebitNormal("liability")).toBe(false);
    expect(isDebitNormal("equity")).toBe(false);
    expect(isDebitNormal("revenue")).toBe(false);
  });
});

describe("createAccount", () => {
  it("rejects a blank code without touching the database", async () => {
    const { service, chainsByTable } = makeService({});
    const result = await createAccount(service, { tenantId: "t1", code: "  ", name: "Cash", type: "asset" });
    expect(result).toEqual({ ok: false, error: "Code and name are required." });
    expect(Object.keys(chainsByTable)).toHaveLength(0);
  });

  it("rejects a blank name without touching the database", async () => {
    const { service } = makeService({});
    const result = await createAccount(service, { tenantId: "t1", code: "1000", name: "   ", type: "asset" });
    expect(result).toEqual({ ok: false, error: "Code and name are required." });
  });

  it("maps a unique-constraint violation to a friendly message", async () => {
    const { service } = makeService({
      chart_of_accounts: { data: null, error: { code: "23505", message: "duplicate key" } },
    });
    const result = await createAccount(service, { tenantId: "t1", code: "1000", name: "Cash", type: "asset" });
    expect(result).toEqual({ ok: false, error: "Account code 1000 already exists." });
  });

  it("returns the new id on success", async () => {
    const { service } = makeService({
      chart_of_accounts: { data: { id: "acct-1" }, error: null },
    });
    const result = await createAccount(service, { tenantId: "t1", code: "1000", name: "Cash", type: "asset" });
    expect(result).toEqual({ ok: true, id: "acct-1" });
  });
});

describe("seedHospitalityChartOfAccounts", () => {
  it("inserts nothing when every starter code already exists", async () => {
    const existing = [
      "1000", "1010", "1020", "1100", "1200", "1300", "1400", "1500", "1590",
      "2000", "2100", "2200", "2300", "2400", "3000", "3100",
      "4000", "4100", "4200", "4300",
      "5000", "5100", "5200", "5300", "5400", "5500", "5600", "5700",
    ].map((code) => ({ id: code, code, name: code, type: "asset", parent_id: null, is_active: true }));

    const { service, chainsByTable } = makeService({
      chart_of_accounts: { data: existing, error: null },
    });
    const result = await seedHospitalityChartOfAccounts(service, "t1");
    expect(result).toEqual({ inserted: 0 });
    expect((chainsByTable.chart_of_accounts as { __inserted: unknown[] }).__inserted).toHaveLength(0);
  });

  it("inserts only the codes that don't already exist", async () => {
    const existing = [{ id: "a", code: "1000", name: "Cash on Hand", type: "asset", parent_id: null, is_active: true }];
    const { service, chainsByTable } = makeService({
      chart_of_accounts: { data: existing, error: null },
    });
    const result = await seedHospitalityChartOfAccounts(service, "t1");
    expect(result.inserted).toBe(27);
    const insertedRows = (chainsByTable.chart_of_accounts as { __inserted: { code: string }[][] }).__inserted[0];
    expect(insertedRows.some((r) => r.code === "1000")).toBe(false);
    expect(insertedRows.some((r) => r.code === "4000")).toBe(true);
  });
});
