import type { SupabaseClient } from "@supabase/supabase-js";
import { addMonths } from "@/lib/hms/accounting-periods";
import { postJournalEntry, type JournalEntryLineInput } from "@/lib/hms/journal-entries";
import { createVendorBill, getApAccountId } from "@/lib/hms/vendor-bills";

export type RecurringKind = "journal" | "bill";

export type JournalPayload = { memo: string; lines: JournalEntryLineInput[] };
export type BillPayload = {
  vendorId: string;
  department: string;
  expenseAccountId: string;
  subtotal: number;
  tax: number;
  currency: string;
  reference: string;
  dueInDays: number;
};

export type RecurringTemplate = {
  id: string;
  kind: RecurringKind;
  name: string;
  dayOfMonth: number;
  startMonth: string;
  endMonth: string | null;
  nextRunMonth: string;
  active: boolean;
  payload: JournalPayload | BillPayload;
  lastError: string | null;
  lastRunAt: string | null;
  createdBy: string;
};

/** Most months one run will catch up, so a template left for years cannot post hundreds at once. */
export const MAX_CATCH_UP_MONTHS = 24;

/** The date a month's entry is dated: the chosen day, which is always 1 to 28 so every month has it. */
export function scheduledDate(month: string, dayOfMonth: number): string {
  return `${month.slice(0, 7)}-${String(dayOfMonth).padStart(2, "0")}`;
}

/** Months a template is due to post, oldest first: from its next month up to the last whose date has come. */
export function dueMonths(t: { nextRunMonth: string; endMonth: string | null; dayOfMonth: number; active: boolean }, today: string): string[] {
  if (!t.active) return [];
  const out: string[] = [];
  for (let m = t.nextRunMonth; out.length < MAX_CATCH_UP_MONTHS; m = addMonths(m, 1)) {
    if (t.endMonth && m > t.endMonth) break;
    if (scheduledDate(m, t.dayOfMonth) > today) break;
    out.push(m);
  }
  return out;
}

export function checkJournalPayload(p: JournalPayload): string | null {
  if (!p.memo.trim()) return "Give the entry a memo.";
  if (p.lines.length < 2) return "A journal needs at least two lines.";
  let d = 0;
  let c = 0;
  for (const l of p.lines) {
    if (!l.accountId) return "Every line needs an account.";
    if ((l.debit > 0) === (l.credit > 0)) return "Each line needs either a debit or a credit.";
    d += l.debit;
    c += l.credit;
  }
  if (Math.abs(d - c) > 0.01) return `The lines do not balance: debits ${d.toFixed(2)}, credits ${c.toFixed(2)}.`;
  return null;
}

export async function listRecurring(service: SupabaseClient, tenantId: string): Promise<RecurringTemplate[]> {
  const { data, error } = await service
    .schema("hotel")
    .from("recurring_templates")
    .select("id,kind,name,day_of_month,start_month,end_month,next_run_month,active,payload,last_error,last_run_at,created_by")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as RecurringKind,
    name: r.name as string,
    dayOfMonth: r.day_of_month as number,
    startMonth: r.start_month as string,
    endMonth: (r.end_month as string | null) ?? null,
    nextRunMonth: r.next_run_month as string,
    active: r.active as boolean,
    payload: r.payload as JournalPayload | BillPayload,
    lastError: (r.last_error as string | null) ?? null,
    lastRunAt: (r.last_run_at as string | null) ?? null,
    createdBy: r.created_by as string,
  }));
}

export async function createRecurring(
  service: SupabaseClient,
  params: {
    tenantId: string;
    actorUserId: string;
    kind: RecurringKind;
    name: string;
    dayOfMonth: number;
    startMonth: string;
    endMonth?: string | null;
    payload: JournalPayload | BillPayload;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!params.name.trim()) return { ok: false, error: "Give it a name." };
  if (params.kind === "journal") {
    const problem = checkJournalPayload(params.payload as JournalPayload);
    if (problem) return { ok: false, error: problem };
  } else {
    const b = params.payload as BillPayload;
    if (!b.vendorId || !b.expenseAccountId) return { ok: false, error: "Pick a vendor and an expense account." };
    if (!(b.subtotal > 0)) return { ok: false, error: "The bill amount must be more than zero." };
  }
  const { data, error } = await service
    .schema("hotel")
    .from("recurring_templates")
    .insert({
      tenant_id: params.tenantId,
      kind: params.kind,
      name: params.name.trim(),
      day_of_month: params.dayOfMonth,
      start_month: params.startMonth,
      end_month: params.endMonth ?? null,
      next_run_month: params.startMonth,
      payload: params.payload,
      created_by: params.actorUserId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}

/** Posts every month that is due. A month that fails (a closed month, say) stops that template and
 * records why; the others carry on, and the failed month is tried again next time. */
export async function runDueRecurring(
  service: SupabaseClient,
  params: { tenantId: string; today: string; onlyTemplateId?: string },
): Promise<{ posted: number; failed: { name: string; error: string }[] }> {
  let templates = (await listRecurring(service, params.tenantId)).filter((t) => t.active);
  if (params.onlyTemplateId) templates = templates.filter((t) => t.id === params.onlyTemplateId);

  let posted = 0;
  const failed: { name: string; error: string }[] = [];

  for (const t of templates) {
    const actor = t.createdBy;
    let error: string | null = null;
    let next = t.nextRunMonth;

    for (const month of dueMonths(t, params.today)) {
      const date = scheduledDate(month, t.dayOfMonth);
      // Claim the month first; a clash means another run already did it.
      const { data: claim, error: claimError } = await service
        .schema("hotel")
        .from("recurring_runs")
        .insert({ tenant_id: params.tenantId, template_id: t.id, run_month: month })
        .select("id")
        .single();
      if (claimError || !claim) {
        next = addMonths(month, 1);
        continue;
      }

      let result: { ok: true; journalEntryId?: string; billId?: string } | { ok: false; error: string };
      if (t.kind === "journal") {
        const p = t.payload as JournalPayload;
        const r = await postJournalEntry(service, {
          tenantId: params.tenantId,
          entryDate: date,
          memo: `${p.memo} (${t.name}, ${month.slice(0, 7)})`,
          reference: `recurring-${t.id.slice(0, 8)}-${month.slice(0, 7)}`,
          createdBy: actor,
          lines: p.lines,
        });
        result = r.ok ? { ok: true, journalEntryId: r.id } : r;
      } else {
        const p = t.payload as BillPayload;
        const apAccountId = await getApAccountId(service, params.tenantId);
        if (!apAccountId) {
          result = { ok: false, error: "Accounts Payable (2000) is missing from the chart of accounts." };
        } else {
          const due = new Date(Date.parse(`${date}T00:00:00Z`) + p.dueInDays * 86_400_000).toISOString().slice(0, 10);
          const r = await createVendorBill(service, {
            tenantId: params.tenantId,
            vendorId: p.vendorId,
            department: p.department,
            billReference: `${p.reference || t.name} ${month.slice(0, 7)}`,
            billDate: date,
            dueDate: due,
            currency: p.currency,
            expenseAccountId: p.expenseAccountId,
            apAccountId,
            subtotal: p.subtotal,
            tax: p.tax,
            notes: `Recurring: ${t.name}`,
            createdBy: actor,
          });
          result = r.ok ? { ok: true, billId: r.id } : r;
        }
      }

      if (!result.ok) {
        await service.schema("hotel").from("recurring_runs").delete().eq("id", claim.id as string);
        error = `${month.slice(0, 7)}: ${result.error}`;
        break;
      }
      await service
        .schema("hotel")
        .from("recurring_runs")
        .update({ journal_entry_id: result.journalEntryId ?? null, vendor_bill_id: result.billId ?? null })
        .eq("id", claim.id as string);
      posted += 1;
      next = addMonths(month, 1);
    }

    const ended = t.endMonth !== null && next > t.endMonth;
    await service
      .schema("hotel")
      .from("recurring_templates")
      .update({
        next_run_month: next,
        active: !ended,
        last_error: error,
        ...(next !== t.nextRunMonth ? { last_run_at: new Date().toISOString() } : {}),
      })
      .eq("id", t.id);
    if (error) failed.push({ name: t.name, error });
  }
  return { posted, failed };
}

