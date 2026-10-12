import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SHOP_CURRENCIES, type FxRates } from "./currencies";

/*
 * Reference exchange rates for converting shop prices, from ExchangeRate-API's
 * free open endpoint (no key, updated daily; its terms ask for a link back,
 * shown in the currency settings). Saved to store.fx_rates by the daily cron so
 * page loads never call the API.
 */

const SOURCE_URL = "https://open.er-api.com/v6/latest/USD";
const SOURCE = "exchangerate-api.com";
/** Older than this and a read tops the rates up itself, in case the cron hasn't run. */
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;
const RETRY_AFTER_MS = 10 * 60 * 1000;
let lastRefreshAttempt = 0;

const db = () => createServerSupabaseClient().schema("store");

/** Fetches today's rates and saves them. Returns how many currencies were updated. */
export async function refreshFxRates(): Promise<number> {
  const res = await fetch(SOURCE_URL, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Exchange rate request failed (${res.status})`);
  const body = (await res.json()) as { result?: string; rates?: Record<string, number> };
  if (body.result !== "success" || !body.rates) throw new Error("Exchange rate response wasn't usable");

  const now = new Date().toISOString();
  const rows = SHOP_CURRENCIES.filter((code) => typeof body.rates![code] === "number" && body.rates![code] > 0).map((code) => ({
    currency: code,
    per_usd: body.rates![code],
    source: SOURCE,
    fetched_at: now,
  }));
  if (!rows.length) throw new Error("Exchange rate response had none of our currencies");

  const { error } = await db().from("fx_rates").upsert(rows, { onConflict: "currency" });
  if (error) throw new Error(error.message);
  return rows.length;
}

export type FxRatesSnapshot = { rates: FxRates; fetchedAt: string | null };

/** The saved rates, refreshed first if they're missing or stale. A failed refresh falls back to what's saved. */
export const getFxRates = cache(async (): Promise<FxRatesSnapshot> => {
  const read = async () => {
    const { data } = await db().from("fx_rates").select("currency, per_usd, fetched_at");
    const rows = data || [];
    const rates: FxRates = Object.fromEntries(rows.map((r) => [r.currency as string, Number(r.per_usd)]));
    const fetchedAt = rows.reduce<string | null>((oldest, r) => (!oldest || r.fetched_at < oldest ? (r.fetched_at as string) : oldest), null);
    return { rates, fetchedAt };
  };

  const snapshot = await read();
  const stale = !snapshot.fetchedAt || Date.now() - new Date(snapshot.fetchedAt).getTime() > STALE_AFTER_MS;
  // If the API is down, don't make every page view wait on it.
  if (!stale || Date.now() - lastRefreshAttempt < RETRY_AFTER_MS) return snapshot;
  lastRefreshAttempt = Date.now();
  try {
    await refreshFxRates();
    return await read();
  } catch {
    return snapshot;
  }
});
