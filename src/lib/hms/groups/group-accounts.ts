import type { SupabaseClient } from "@supabase/supabase-js";
import { consolidate, periodStatus, type AccountType, type Consolidation, type TrialBalanceLine } from "./group-consolidation";
import { logGroupAction, type GroupAccessContext } from "./group-access";

/*
 * Consolidated accounts for a group. The trial balance comes from hotel.group_trial_balance, which
 * runs with the caller's rights, so row-level security decides which hotels' journals count.
 */

export type InterCompanyAccount = { tenantId: string; code: string; note: string | null };

export type GroupAccountsView = {
  from: string;
  to: string;
  consolidation: Consolidation;
  interCompany: InterCompanyAccount[];
  periods: Array<{ month: string; final: boolean; openAt: string[] }>;
  /** Hotels whose chart couldn't be read (should be none for a group role). */
  missingHotels: string[];
  /** Every account code in use, per hotel, for the inter-company picker. */
  accountsByHotel: Record<string, Array<{ code: string; name: string; type: AccountType }>>;
};

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const endY = Number(to.slice(0, 4));
  const endM = Number(to.slice(5, 7));
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, "0")}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
    if (out.length > 36) break;
  }
  return out;
}

export async function loadGroupAccounts(ctx: GroupAccessContext, from: string, to: string): Promise<GroupAccountsView> {
  const db: SupabaseClient = ctx.userDb;
  const hotelIds = ctx.hotels.map((h) => h.tenantId);
  const [tb, ic, periods] = await Promise.all([
    db.schema("hotel").rpc("group_trial_balance", { p_group: ctx.group.id, p_from: from, p_to: to }),
    db.schema("hotel").from("hotel_group_ic_accounts").select("tenant_id, account_code, note").eq("group_id", ctx.group.id),
    db.schema("hotel").from("accounting_periods").select("tenant_id, period_month, status").in("tenant_id", hotelIds).gte("period_month", from.slice(0, 7) + "-01").lte("period_month", to),
  ]);
  if (tb.error) throw new Error(tb.error.message);
  const lines: TrialBalanceLine[] = ((tb.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    tenantId: r.tenant_id as string,
    code: r.account_code as string,
    name: r.account_name as string,
    type: r.account_type as AccountType,
    periodDebit: Number(r.period_debit) || 0,
    periodCredit: Number(r.period_credit) || 0,
    closingDebit: Number(r.closing_debit) || 0,
    closingCredit: Number(r.closing_credit) || 0,
  }));
  const interCompany = ((ic.data ?? []) as Array<Record<string, unknown>>).map((r) => ({ tenantId: r.tenant_id as string, code: r.account_code as string, note: (r.note as string) ?? null }));

  const closedByHotel: Record<string, string[]> = {};
  for (const p of (periods.data ?? []) as Array<Record<string, unknown>>) {
    if (p.status !== "closed") continue;
    const id = p.tenant_id as string;
    (closedByHotel[id] ??= []).push(String(p.period_month).slice(0, 10));
  }
  const names = Object.fromEntries(ctx.hotels.map((h) => [h.tenantId, h.name]));
  const accountsByHotel: GroupAccountsView["accountsByHotel"] = {};
  for (const l of lines) (accountsByHotel[l.tenantId] ??= []).push({ code: l.code, name: l.name, type: l.type });
  for (const id of Object.keys(accountsByHotel)) accountsByHotel[id].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));

  return {
    from,
    to,
    consolidation: consolidate(lines, hotelIds, interCompany),
    interCompany,
    periods: periodStatus(monthsBetween(from, to), closedByHotel, names),
    missingHotels: ctx.hotels.filter((h) => !accountsByHotel[h.tenantId]).map((h) => h.name),
    accountsByHotel,
  };
}

export async function markInterCompany(ctx: GroupAccessContext, tenantId: string, code: string, note: string | null) {
  if (!ctx.hotels.some((h) => h.tenantId === tenantId)) throw new Error("That hotel isn't in this group.");
  const clean = code.trim();
  if (!clean) throw new Error("Choose an account.");
  const { error } = await ctx.service.schema("hotel").from("hotel_group_ic_accounts").upsert(
    { group_id: ctx.group.id, tenant_id: tenantId, account_code: clean, note: note?.trim() || null, added_by: ctx.userId },
    { onConflict: "group_id,tenant_id,account_code" },
  );
  if (error) throw new Error(error.message);
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "ic_account_added", tenantId, detail: { code: clean } });
}

export async function unmarkInterCompany(ctx: GroupAccessContext, tenantId: string, code: string) {
  const { error } = await ctx.service.schema("hotel").from("hotel_group_ic_accounts").delete().eq("group_id", ctx.group.id).eq("tenant_id", tenantId).eq("account_code", code);
  if (error) throw new Error(error.message);
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "ic_account_removed", tenantId, detail: { code } });
}
