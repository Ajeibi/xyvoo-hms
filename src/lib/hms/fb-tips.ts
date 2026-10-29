import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCheckInStaffOptions } from "@/lib/hms/check-in-staff-options";
import {
  type FbTipBalance,
  type FbTipPayoutMethod,
  type FbTipPayoutRow,
  type FbTipRow,
  type FbTipSource,
  tipBalances,
} from "@/lib/hms/fb-tip-rules";

export type FbTipStaff = { userId: string; name: string };

export type FbTipEntry = {
  id: string;
  orderId: string;
  orderNumber: string;
  staffId: string | null;
  amount: number;
  method: string;
  takenBy: string | null;
  createdAt: string;
};

export type FbTipPayoutEntry = {
  id: string;
  staffId: string;
  source: FbTipSource;
  amount: number;
  method: FbTipPayoutMethod;
  note: string | null;
  paidBy: string | null;
  createdAt: string;
};

export type FbTipsModel = {
  staff: FbTipStaff[];
  /** All time: what is owed now. */
  balances: FbTipBalance[];
  /** The last 200 tips and payouts, newest first. */
  recentTips: FbTipEntry[];
  recentPayouts: FbTipPayoutEntry[];
};

const PAGE = 1000;

/** Every row of a query, a page at a time (Supabase returns at most 1,000). */
async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await fetchPage(from, from + PAGE - 1);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

/** Hotel staff for the tip picker: names without the role suffix. */
export async function loadTipStaff(supabase: SupabaseClient, tenantId: string): Promise<FbTipStaff[]> {
  const options = await fetchCheckInStaffOptions(supabase, tenantId);
  return options.map((o) => ({ userId: o.userId, name: o.displayName.replace(/ \((Owner|Admin|Staff)\)$/, "") }));
}

export async function loadTipsModel(supabase: SupabaseClient, tenantId: string): Promise<FbTipsModel> {
  const [staff, tips, payouts] = await Promise.all([
    loadTipStaff(supabase, tenantId),
    allRows<Record<string, unknown>>((from, to) =>
      supabase
        .schema("hotel")
        .from("fb_order_payments")
        .select("id,order_id,tip_amount,tip_staff_id,method,taken_by,created_at")
        .eq("tenant_id", tenantId)
        .gt("tip_amount", 0)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
    allRows<Record<string, unknown>>((from, to) =>
      supabase
        .schema("hotel")
        .from("fb_tip_payouts")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .range(from, to),
    ),
  ]);

  const tipRows: FbTipRow[] = tips.map((t) => ({
    staff_id: (t.tip_staff_id as string) ?? null,
    tip_amount: Number(t.tip_amount) || 0,
    method: t.method as string,
    created_at: t.created_at as string,
  }));
  const payoutRows: FbTipPayoutRow[] = payouts.map((p) => ({
    staff_id: p.staff_id as string,
    source: p.source as FbTipSource,
    amount: Number(p.amount) || 0,
    method: p.method as FbTipPayoutMethod,
    created_at: p.created_at as string,
  }));

  const recent = tips.slice(0, 200);
  const orderIds = [...new Set(recent.map((t) => t.order_id as string))];
  const { data: orders } = orderIds.length
    ? await supabase.schema("hotel").from("fb_orders").select("id,order_number").in("id", orderIds)
    : { data: [] };
  const numberById = new Map((orders ?? []).map((o) => [o.id as string, o.order_number as string]));

  return {
    staff,
    balances: tipBalances(tipRows, payoutRows),
    recentTips: recent.map((t) => ({
      id: t.id as string,
      orderId: t.order_id as string,
      orderNumber: numberById.get(t.order_id as string) ?? "",
      staffId: (t.tip_staff_id as string) ?? null,
      amount: Number(t.tip_amount) || 0,
      method: t.method as string,
      takenBy: (t.taken_by as string) ?? null,
      createdAt: t.created_at as string,
    })),
    recentPayouts: payouts.slice(0, 200).map((p) => ({
      id: p.id as string,
      staffId: p.staff_id as string,
      source: p.source as FbTipSource,
      amount: Number(p.amount) || 0,
      method: p.method as FbTipPayoutMethod,
      note: (p.note as string) ?? null,
      paidBy: (p.paid_by as string) ?? null,
      createdAt: p.created_at as string,
    })),
  };
}

/** Records tips handed over. The SQL function locks the hotel's tips so the same money can't go out twice. */
export async function payTips(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    source: FbTipSource;
    payments: { staffId: string; amount: number }[];
    method: FbTipPayoutMethod;
    note?: string | null;
    paidBy: string;
  },
) {
  const { data, error } = await supabase.schema("hotel").rpc("fb_pay_tips", {
    p_tenant_id: params.tenantId,
    p_source: params.source,
    p_staff_ids: params.payments.map((p) => p.staffId),
    p_amounts: params.payments.map((p) => p.amount),
    p_method: params.method,
    p_note: params.note ?? null,
    p_paid_by: params.paidBy,
  });
  if (error) return { error: error.message, total: 0, payoutIds: [] as string[] };
  const result = data as { total: number; payout_ids: string[] };
  return { error: null, total: Number(result.total) || 0, payoutIds: result.payout_ids ?? [] };
}
