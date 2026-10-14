import { rateLimitShared } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { loyaltySettings, type LoyaltyReason, type LoyaltySettings } from "./loyalty";

const db = () => createServerSupabaseClient().schema("store");
const missing = (error: { code?: string } | null) => Boolean(error && ["42P01", "42703", "PGRST205", "PGRST204", "PGRST202"].includes(error.code ?? ""));

export async function getLoyaltySettings(tenantId: string): Promise<LoyaltySettings> {
  const { data, error } = await db().from("business_profile").select("loyalty").eq("tenant_id", tenantId).maybeSingle();
  if (error && !missing(error)) throw new Error(error.message);
  return loyaltySettings(data?.loyalty);
}

export async function saveLoyaltySettings(tenantId: string, settings: LoyaltySettings) {
  const { error } = await db().from("business_profile").upsert({ tenant_id: tenantId, loyalty: settings }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
}

export async function loyaltyBalance(accountId: string): Promise<number> {
  const { data, error } = await db().rpc("loyalty_balance", { p_account_id: accountId });
  if (error) {
    if (missing(error)) return 0;
    throw new Error(error.message);
  }
  return Number(data) || 0;
}

export type LedgerEntry = { id: string; points: number; reason: LoyaltyReason; note: string | null; orderId: string | null; createdAt: string };

export async function loyaltyHistory(accountId: string, limit = 20): Promise<LedgerEntry[]> {
  const { data, error } = await db().from("loyalty_ledger").select("id, points, reason, note, order_id, created_at").eq("account_id", accountId).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map((r) => ({ id: r.id as string, points: r.points as number, reason: r.reason as LoyaltyReason, note: (r.note as string | null) ?? null, orderId: (r.order_id as string | null) ?? null, createdAt: r.created_at as string }));
}

export type LoyaltyMember = { accountId: string; name: string | null; email: string; balance: number; earned: number; used: number };

/** Everyone with points activity, biggest balance first, plus the figures for the top of the page. */
export async function loyaltyOverview(tenantId: string) {
  const { data, error } = await db().from("loyalty_ledger").select("account_id, points, reason").eq("tenant_id", tenantId).limit(50_000);
  if (error) {
    if (missing(error)) return { members: [] as LoyaltyMember[], outstanding: 0, earned: 0, used: 0 };
    throw new Error(error.message);
  }
  const byAccount = new Map<string, { balance: number; earned: number; used: number }>();
  for (const r of data || []) {
    const row = byAccount.get(r.account_id as string) ?? { balance: 0, earned: 0, used: 0 };
    row.balance += r.points as number;
    if (r.reason === "earned") row.earned += r.points as number;
    if (r.reason === "redeemed") row.used += -(r.points as number);
    byAccount.set(r.account_id as string, row);
  }
  const ids = [...byAccount.keys()];
  const { data: accounts } = ids.length ? await db().from("customer_accounts").select("id, name, email").in("id", ids.slice(0, 1000)) : { data: [] };
  const info = new Map((accounts || []).map((a) => [a.id as string, a]));
  const members = ids
    .map((id): LoyaltyMember => ({ accountId: id, name: (info.get(id)?.name as string | null) ?? null, email: (info.get(id)?.email as string) ?? "", ...byAccount.get(id)! }))
    .filter((m) => m.email)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 200);
  return {
    members,
    outstanding: [...byAccount.values()].reduce((s, r) => s + Math.max(r.balance, 0), 0),
    earned: [...byAccount.values()].reduce((s, r) => s + r.earned, 0),
    used: [...byAccount.values()].reduce((s, r) => s + r.used, 0),
  };
}

/** Adds or removes points by hand. The balance can't go below zero. Returns the new balance, or an error code. */
export async function adjustLoyaltyPoints(tenantId: string, input: { email: string; points: number; note: string }, userId: string | null) {
  const { data: account } = await db().from("customer_accounts").select("id").eq("tenant_id", tenantId).eq("email", input.email).maybeSingle();
  if (!account) return { error: "NO_ACCOUNT" as const };
  const balance = await loyaltyBalance(account.id as string);
  if (balance + input.points < 0) return { error: "BELOW_ZERO" as const, balance };
  const { error } = await db().from("loyalty_ledger").insert({ tenant_id: tenantId, account_id: account.id, points: input.points, reason: "adjusted", note: input.note, created_by: userId });
  if (error) throw new Error(error.message);
  return { balance: balance + input.points };
}

/** Expires points that have sat unused for the shop's chosen time, at most every six hours whoever asks. */
export async function runLoyaltyExpiryIfDue() {
  try {
    if (!(await rateLimitShared("job:loyalty-expiry", 1, 6 * 3_600_000)).ok) return;
    await expireLoyaltyPoints();
  } catch (error) {
    console.error("[loyalty] expiry failed", error);
  }
}

export async function expireLoyaltyPoints() {
  const { data, error } = await db().rpc("expire_loyalty_points");
  if (error) {
    if (missing(error)) return 0;
    throw new Error(error.message);
  }
  return Number(data) || 0;
}
