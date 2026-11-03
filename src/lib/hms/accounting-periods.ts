import type { SupabaseClient } from "@supabase/supabase-js";
import { getTrialBalance } from "@/lib/hms/journal-entries";

export type PeriodStatus = "open" | "closing" | "closed";

export type PeriodRow = {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  status: PeriodStatus;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenReason: string | null;
};

export type PeriodChecks = {
  month: string;
  entryCount: number;
  /** Debits minus credits over the whole ledger up to the month end; anything but 0 is a fault. */
  trialBalanceDifference: number;
  /** Days in the month with no night audit run (only days that have already finished). */
  unauditedDates: string[];
};

const MONTH_RE = /^\d{4}-\d{2}-01$/;

export function isMonthStart(value: string): boolean {
  return MONTH_RE.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

/** First day of the month holding `date` (YYYY-MM-DD in, YYYY-MM-DD out). */
export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEndOf(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

export function addMonths(month: string, count: number): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + count, 1)).toISOString().slice(0, 10);
}

/** Months from `from` to `to` inclusive, oldest first. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

/** True when `date` falls in a month marked closed. Mirrors what the database trigger enforces. */
export function isDateInClosedPeriod(periods: Pick<PeriodRow, "month" | "status">[], date: string): boolean {
  const month = monthStartOf(date);
  return periods.some((p) => p.month === month && p.status === "closed");
}

/** A month can only be closed once it has finished. */
export function canCloseMonth(month: string, today: string): { ok: true } | { ok: false; error: string } {
  if (!isMonthStart(month)) return { ok: false, error: "Pick a month." };
  if (monthEndOf(month) >= today) return { ok: false, error: "That month has not finished yet, so it cannot be closed." };
  return { ok: true };
}

export async function listPeriods(service: SupabaseClient, tenantId: string): Promise<PeriodRow[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("accounting_periods")
    .select("period_month,status,closed_at,closed_by,reopened_at,reopen_reason")
    .eq("tenant_id", tenantId)
    .order("period_month", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    month: r.period_month as string,
    status: r.status as PeriodStatus,
    closedAt: (r.closed_at as string | null) ?? null,
    closedBy: (r.closed_by as string | null) ?? null,
    reopenedAt: (r.reopened_at as string | null) ?? null,
    reopenReason: (r.reopen_reason as string | null) ?? null,
  }));
}

/** Checks to show before a month is closed. None of these block; the accountant decides. */
export async function getPeriodChecks(
  service: SupabaseClient,
  tenantId: string,
  month: string,
  today: string,
): Promise<PeriodChecks> {
  const end = monthEndOf(month);
  const [{ count }, trial, { data: runs }] = await Promise.all([
    service
      .schema("hotel")
      .from("journal_entries")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("entry_date", month)
      .lte("entry_date", end),
    getTrialBalance(service, tenantId, { asOfDate: end }),
    service
      .schema("hotel")
      .from("night_audit_runs")
      .select("audit_date")
      .eq("tenant_id", tenantId)
      .gte("audit_date", month)
      .lte("audit_date", end),
  ]);

  const totals = trial.reduce((a, r) => ({ debit: a.debit + r.debit, credit: a.credit + r.credit }), { debit: 0, credit: 0 });
  const audited = new Set((runs ?? []).map((r) => r.audit_date as string));
  const unauditedDates: string[] = [];
  for (let d = month; d <= end && d < today; d = new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)) {
    if (!audited.has(d)) unauditedDates.push(d);
  }

  return {
    month,
    entryCount: count ?? 0,
    trialBalanceDifference: Math.round((totals.debit - totals.credit) * 100) / 100,
    unauditedDates,
  };
}

export async function setPeriodClosed(
  service: SupabaseClient,
  params: { tenantId: string; month: string; actorUserId: string; today: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const can = canCloseMonth(params.month, params.today);
  if (!can.ok) return can;

  const { data: existing } = await service
    .schema("hotel")
    .from("accounting_periods")
    .select("id,status")
    .eq("tenant_id", params.tenantId)
    .eq("period_month", params.month)
    .maybeSingle();
  if (existing?.status === "closed") return { ok: false, error: "That month is already closed." };

  const patch = {
    status: "closed",
    closed_at: new Date().toISOString(),
    closed_by: params.actorUserId,
  };
  const { error } = existing
    ? await service.schema("hotel").from("accounting_periods").update(patch).eq("id", existing.id as string)
    : await service
        .schema("hotel")
        .from("accounting_periods")
        .insert({ tenant_id: params.tenantId, period_month: params.month, ...patch });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function setPeriodReopened(
  service: SupabaseClient,
  params: { tenantId: string; month: string; actorUserId: string; reason: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const reason = params.reason.trim();
  if (!reason) return { ok: false, error: "Say why the month is being reopened." };

  const { data: existing } = await service
    .schema("hotel")
    .from("accounting_periods")
    .select("id,status")
    .eq("tenant_id", params.tenantId)
    .eq("period_month", params.month)
    .maybeSingle();
  if (!existing || existing.status !== "closed") return { ok: false, error: "That month is not closed." };

  const { error } = await service
    .schema("hotel")
    .from("accounting_periods")
    .update({ status: "open", reopened_by: params.actorUserId, reopen_reason: reason })
    .eq("id", existing.id as string);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
