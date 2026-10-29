import type { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Saving a stock figure from the product editor without losing sales made
 * while it was open. The editor sends the figure it opened with (stock_was)
 * beside the one the merchant typed (stock):
 *   - the same: the merchant didn't touch it, so the stock isn't written at all
 *   - different: the difference is added to the stock as it is now, so an
 *     order placed in the meantime still counts ("I had 10, now 15" adds 5)
 * Without stock_was (imports, older callers) the typed figure is set as before.
 */

export type StockChange = { kind: "keep" } | { kind: "set"; value: number } | { kind: "add"; delta: number };

const whole = (value: unknown) => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : null;
};

/** What to do with a stock figure from the editor. Pure, for tests. */
export function stockChange(typed: unknown, was: unknown): StockChange {
  const value = whole(typed);
  if (value === null) return { kind: "keep" };
  const before = whole(was);
  if (before === null) return { kind: "set", value: Math.max(0, value) };
  return value === before ? { kind: "keep" } : { kind: "add", delta: value - before };
}

type Db = ReturnType<ReturnType<typeof createServerSupabaseClient>["schema"]>;

/**
 * Adds to a row's stock (never below 0) as one change: it writes only if the
 * stock is still what it just read, and tries again if an order got there
 * first. Returns the new stock, or null if the row wasn't found.
 */
export async function addToStock(db: Db, table: "products" | "product_variants", id: string, delta: number, match: Record<string, string> = {}): Promise<number | null> {
  for (let attempt = 0; attempt < 5; attempt++) {
    let read = db.from(table).select("stock").eq("id", id);
    for (const [k, v] of Object.entries(match)) read = read.eq(k, v);
    const { data, error } = await read.maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const current = Number(data.stock) || 0;
    const next = Math.max(0, current + delta);
    let write = db.from(table).update({ stock: next }).eq("id", id).eq("stock", current);
    for (const [k, v] of Object.entries(match)) write = write.eq(k, v);
    const { data: written, error: writeError } = await write.select("id");
    if (writeError) throw new Error(writeError.message);
    if (written?.length) return next;
  }
  throw new Error("The stock changed several times while saving. Please try again.");
}
