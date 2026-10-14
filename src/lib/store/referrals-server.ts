import { createServerSupabaseClient } from "@/lib/supabase/server";
import { newReferralCode, referralCodeProblem, referralSettings, type ReferralSettings } from "./referrals";

const db = () => createServerSupabaseClient().schema("store");
const missing = (error: { code?: string } | null) => Boolean(error && ["42P01", "42703", "PGRST205", "PGRST204"].includes(error.code ?? ""));

export async function getReferralSettings(tenantId: string): Promise<ReferralSettings> {
  const { data, error } = await db().from("business_profile").select("referrals").eq("tenant_id", tenantId).maybeSingle();
  if (error && !missing(error)) throw new Error(error.message);
  return referralSettings(data?.referrals);
}

/** Saves the rules, and brings every customer's existing code in line with them (or switches the codes off). */
export async function saveReferralSettings(tenantId: string, settings: ReferralSettings) {
  const { error } = await db().from("business_profile").upsert({ tenant_id: tenantId, referrals: settings }, { onConflict: "tenant_id" });
  if (error) throw new Error(error.message);
  const { error: syncError } = await db()
    .from("discount_codes")
    .update({ kind: settings.friendKind, value: settings.friendValue, min_subtotal: settings.minOrder > 0 ? settings.minOrder : null, is_active: settings.enabled })
    .eq("tenant_id", tenantId)
    .not("referral_account_id", "is", null);
  if (syncError && !missing(syncError)) throw new Error(syncError.message);
}

/** The customer's own friend code, made the first time it is asked for. */
export async function ensureReferralCode(tenantId: string, accountId: string, settings: ReferralSettings): Promise<string | null> {
  const { data: existing } = await db().from("discount_codes").select("code").eq("tenant_id", tenantId).eq("referral_account_id", accountId).maybeSingle();
  if (existing?.code) return existing.code as string;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newReferralCode();
    const { error } = await db().from("discount_codes").insert({
      tenant_id: tenantId,
      code,
      description: "Friend referral code",
      kind: settings.friendKind,
      value: settings.friendValue,
      min_subtotal: settings.minOrder > 0 ? settings.minOrder : null,
      per_customer_limit: 1,
      is_active: settings.enabled,
      referral_account_id: accountId,
    });
    if (!error) return code;
    if (error.code !== "23505") throw new Error(error.message);
    // The same code twice, or this customer already has one (made at the same moment): look again.
    const { data: again } = await db().from("discount_codes").select("code").eq("tenant_id", tenantId).eq("referral_account_id", accountId).maybeSingle();
    if (again?.code) return again.code as string;
  }
  return null;
}

/** What the customer sees on their account page. */
export async function accountReferralSummary(tenantId: string, accountId: string) {
  const { data, error } = await db().from("referrals").select("reward_kind, reward_value").eq("tenant_id", tenantId).eq("referrer_account_id", accountId);
  if (error && !missing(error)) throw new Error(error.message);
  const rows = data || [];
  return {
    friends: rows.length,
    points: rows.filter((r) => r.reward_kind === "points").reduce((s, r) => s + Number(r.reward_value), 0),
    giftCards: rows.filter((r) => r.reward_kind === "gift_card").reduce((s, r) => s + Number(r.reward_value), 0),
  };
}

export type ReferralRow = { id: string; referrer: string; friendEmail: string | null; orderRef: string; kind: "points" | "gift_card"; value: number; createdAt: string };

/** Rewards given, newest first, with the figures for the top of the dashboard page. */
export async function referralOverview(tenantId: string) {
  const { data, error } = await db()
    .from("referrals")
    .select("id, referrer_account_id, friend_email, order_id, reward_kind, reward_value, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) {
    if (missing(error)) return { rows: [] as ReferralRow[], total: 0, points: 0, giftCards: 0 };
    throw new Error(error.message);
  }
  const rows = data || [];
  const { data: accounts } = rows.length ? await db().from("customer_accounts").select("id, name, email").in("id", [...new Set(rows.map((r) => r.referrer_account_id as string))]) : { data: [] };
  const who = new Map((accounts || []).map((a) => [a.id as string, (a.name as string | null) || (a.email as string)]));
  const mapped = rows.map(
    (r): ReferralRow => ({
      id: r.id as string,
      referrer: who.get(r.referrer_account_id as string) ?? "A customer",
      friendEmail: (r.friend_email as string | null) ?? null,
      orderRef: String(r.order_id).slice(0, 8).toUpperCase(),
      kind: r.reward_kind as "points" | "gift_card",
      value: Number(r.reward_value),
      createdAt: r.created_at as string,
    }),
  );
  return {
    rows: mapped,
    total: mapped.length,
    points: mapped.filter((r) => r.kind === "points").reduce((s, r) => s + r.value, 0),
    giftCards: mapped.filter((r) => r.kind === "gift_card").reduce((s, r) => s + r.value, 0),
  };
}

/**
 * For checkout: a message if this friend can't use this referral code, else
 * null. Not a referral code, or referrals switched off, is handled elsewhere.
 */
export async function referralCodeCheck(tenantId: string, referrerAccountId: string, friendEmail: string): Promise<string | null> {
  const [{ data: referrer }, { count }] = await Promise.all([
    db().from("customer_accounts").select("email").eq("id", referrerAccountId).eq("tenant_id", tenantId).maybeSingle(),
    db().from("orders").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).ilike("customer_email", friendEmail.trim().replace(/[%_\\]/g, (c) => `\\${c}`)).eq("payment_status", "paid"),
  ]);
  if (!referrer) return "That code isn't valid. Remove it or check the spelling.";
  return referralCodeProblem({ friendEmail, referrerEmail: referrer.email as string, paidOrders: count ?? 0 });
}
