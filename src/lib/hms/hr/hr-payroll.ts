import type { SupabaseClient } from "@supabase/supabase-js";
import { getAccountIdByCode } from "@/lib/hms/chart-of-accounts";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { postJournalEntry, reverseJournalEntry } from "@/lib/hms/journal-entries";
import type { HrActor } from "@/lib/hms/hr/hr-api";
import { listEmployeePrivate, listEmployees, listPayProfiles } from "@/lib/hms/hr/hr-employees";
import { unpaidLeaveDays } from "@/lib/hms/hr/hr-leave";
import { getHrSettings } from "@/lib/hms/hr/hr-settings";
import { addDays, entryHours, friendlyDbError, isoToLocalDate, weekStart, workingDaysBetween } from "@/lib/hms/hr/hr-shared";
import { RULES_VERSION, payeRegimeFor } from "@/lib/hms/hr/payroll-rules";
import { calculatePay, payRunJournalLines, splitOvertime, sumPayslips, type PayResult, type PayRunTotals } from "@/lib/hms/hr/payroll-calc";

/*
 * Pay runs and payslips are private tables: every read and write here goes through `privateDb`,
 * the signed-in user's own client, so the database decides who may see pay. The service client
 * is used only for the non-private inputs (hours, leave) and for posting to the books.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

export type PayRunStatus = "draft" | "approved" | "paid" | "void";

export type PayRun = {
  id: string;
  periodStart: string;
  periodEnd: string;
  label: string;
  status: PayRunStatus;
  rulesVersion: string;
  totals: PayRunTotals | null;
  warnings: string[];
  oneOffs: Record<string, { amount: number; note: string | null }>;
  journalEntryId: string | null;
  paidJournalEntryId: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  createdAt: string;
};

export type PayslipSnapshot = {
  name: string;
  employeeNumber: string;
  jobTitle: string | null;
  department: string | null;
  payBasis: string;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  pfaName: string | null;
  rsaPin: string | null;
  tin: string | null;
  nhfNumber: string | null;
  stateOfResidence: string | null;
  regularHours: number;
  overtimeHours: number;
  daysWorked: number;
  unpaidLeaveDays: number;
};

export type Payslip = {
  id: string;
  employeeId: string;
  snapshot: PayslipSnapshot;
  result: PayResult;
};

const mapRun = (r: any): PayRun => ({
  id: r.id,
  periodStart: r.period_start,
  periodEnd: r.period_end,
  label: r.label,
  status: r.status,
  rulesVersion: r.rules_version,
  totals: r.totals?.summary ?? null,
  warnings: r.totals?.warnings ?? [],
  oneOffs: r.totals?.oneOffs ?? {},
  journalEntryId: r.journal_entry_id ?? null,
  paidJournalEntryId: r.paid_journal_entry_id ?? null,
  approvedAt: r.approved_at ?? null,
  paidAt: r.paid_at ?? null,
  createdAt: r.created_at,
});

export async function listPayRuns(privateDb: SupabaseClient, tenantId: string): Promise<PayRun[]> {
  const { data } = await privateDb.schema("hotel").from("hr_pay_runs").select("*").eq("tenant_id", tenantId).order("period_start", { ascending: false }).limit(60);
  return (data ?? []).map(mapRun);
}

export async function getPayRun(privateDb: SupabaseClient, tenantId: string, id: string): Promise<{ run: PayRun; slips: Payslip[] } | null> {
  const { data } = await privateDb.schema("hotel").from("hr_pay_runs").select("*").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!data) return null;
  const { data: slips } = await privateDb.schema("hotel").from("hr_payslips").select("*").eq("tenant_id", tenantId).eq("run_id", id).limit(5000);
  return {
    run: mapRun(data),
    slips: (slips ?? [])
      .map((s: any) => ({ id: s.id, employeeId: s.employee_id, snapshot: s.snapshot as PayslipSnapshot, result: s.breakdown as PayResult }))
      .sort((a: Payslip, b: Payslip) => a.snapshot.name.localeCompare(b.snapshot.name)),
  };
}

/** Works out every payslip for a period from pay profiles, approved hours and unpaid leave. */
async function computeSlips(
  privateDb: SupabaseClient,
  service: SupabaseClient,
  tenantId: string,
  periodStart: string,
  periodEnd: string,
  oneOffs: Record<string, { amount: number; note: string | null }>,
): Promise<{ slips: { employeeId: string; snapshot: PayslipSnapshot; result: PayResult }[]; warnings: string[] }> {
  const settings = await getHrSettings(service, tenantId);
  const [employees, profiles, personal, unpaid] = await Promise.all([
    listEmployees(service, tenantId),
    listPayProfiles(privateDb, tenantId),
    listEmployeePrivate(privateDb, tenantId),
    unpaidLeaveDays(service, tenantId, periodStart, periodEnd),
  ]);
  const warnings: string[] = [];
  const inPeriod = employees.filter(
    (e) => e.status !== "left" || (e.endDate && e.endDate >= periodStart),
  ).filter((e) => !e.startDate || e.startDate <= periodEnd);

  // Approved, finished hours in the period (by the day they clocked in, Lagos time).
  const { data: rawEntries } = await service
    .schema("hotel")
    .from("hr_time_entries")
    .select("employee_id, clock_in, clock_out, break_minutes, status")
    .eq("tenant_id", tenantId)
    .gte("clock_in", `${addDays(periodStart, -1)}T00:00:00Z`)
    .lte("clock_in", `${addDays(periodEnd, 1)}T23:59:59Z`)
    .limit(20000);
  const entries = (rawEntries ?? []).filter((r: any) => {
    const d = isoToLocalDate(r.clock_in);
    return d >= periodStart && d <= periodEnd;
  });
  const pendingCount = entries.filter((r: any) => r.status !== "approved").length;
  if (pendingCount) warnings.push(`${pendingCount} time entries in this period are not approved yet, so they are left out. Approve them on the Time page, then recalculate.`);

  const workingDays = workingDaysBetween(periodStart, periodEnd);
  const slips: { employeeId: string; snapshot: PayslipSnapshot; result: PayResult }[] = [];
  const missingPay: string[] = [];
  const minimumWage = payeRegimeFor(periodEnd).minimumWageMonthly;
  const belowMinimum: string[] = [];

  for (const e of inPeriod) {
    const profile = profiles.get(e.id);
    if (!profile || (profile.payBasis === "monthly" && profile.basicMonthly <= 0) || (profile.payBasis === "hourly" && profile.hourlyRate <= 0) || (profile.payBasis === "daily" && profile.dailyRate <= 0)) {
      missingPay.push(e.fullName);
      continue;
    }
    const mine = entries.filter((r: any) => r.employee_id === e.id && r.status === "approved" && r.clock_out);
    const weekly = new Map<string, number>();
    const days = new Set<string>();
    for (const r of mine) {
      const d = isoToLocalDate(r.clock_in);
      days.add(d);
      const wk = weekStart(d, settings.weekStartsOn);
      weekly.set(wk, (weekly.get(wk) ?? 0) + entryHours({ clockIn: r.clock_in, clockOut: r.clock_out, breakMinutes: num(r.break_minutes) }));
    }
    const split = splitOvertime([...weekly.values()], settings.overtimeAfterWeeklyHours);
    // A monthly salary is pro-rated for someone who joined or left during the period.
    let notEmployedDays = 0;
    if (e.startDate && e.startDate > periodStart) notEmployedDays += workingDaysBetween(periodStart, addDays(e.startDate, -1));
    if (e.endDate && e.endDate < periodEnd) notEmployedDays += workingDaysBetween(addDays(e.endDate, 1), periodEnd);
    const unpaidDays = Math.min(workingDays, (unpaid.get(e.id) ?? 0) + notEmployedDays);
    const oneOff = oneOffs[e.id]?.amount ?? 0;

    const result = calculatePay({
      profile,
      periodEnd,
      regularHours: split.regular,
      // Monthly staff are paid overtime only for hours over the weekly threshold.
      overtimeHours: split.overtime,
      overtimeMultiplier: settings.overtimeMultiplier,
      daysWorked: days.size,
      workingDaysInPeriod: workingDays,
      unpaidLeaveDays: unpaidDays,
      contractedHoursWeek: e.contractedHoursWeek,
      oneOffAdditions: oneOff,
      pensionEnabled: settings.pensionEnabled,
      nsitfEnabled: settings.nsitfEnabled,
      itfEnabled: settings.itfEnabled,
    });
    if (profile.payBasis === "monthly" && unpaidDays === 0 && profile.basicMonthly + profile.housingMonthly + profile.transportMonthly + profile.otherAllowancesMonthly < minimumWage && e.employmentType === "full_time") {
      belowMinimum.push(e.fullName);
    }
    const p = personal.get(e.id);
    slips.push({
      employeeId: e.id,
      snapshot: {
        name: e.fullName,
        employeeNumber: e.employeeNumber,
        jobTitle: e.jobTitle,
        department: e.department,
        payBasis: profile.payBasis,
        bankName: p?.bankName ?? null,
        bankAccountNumber: p?.bankAccountNumber ?? null,
        bankAccountName: p?.bankAccountName ?? null,
        pfaName: p?.pfaName ?? null,
        rsaPin: p?.rsaPin ?? null,
        tin: p?.tin ?? null,
        nhfNumber: p?.nhfNumber ?? null,
        stateOfResidence: p?.stateOfResidence ?? null,
        regularHours: split.regular,
        overtimeHours: split.overtime,
        daysWorked: days.size,
        unpaidLeaveDays: Math.round(unpaidDays * 10) / 10,
      },
      result,
    });
  }
  if (missingPay.length) warnings.push(`No pay set for ${missingPay.join(", ")}, so they are not in this run. Add their pay on their staff record.`);
  if (belowMinimum.length) warnings.push(`Full-time pay below the ₦${minimumWage.toLocaleString("en-NG")} national minimum wage: ${belowMinimum.join(", ")}.`);
  const noBank = slips.filter((s) => !s.snapshot.bankAccountNumber).map((s) => s.snapshot.name);
  if (noBank.length) warnings.push(`No bank account for ${noBank.join(", ")}; they will be missing from the bank schedule.`);
  const noRsa = slips.filter((s) => s.result.pensionEmployee > 0 && !s.snapshot.rsaPin).map((s) => s.snapshot.name);
  if (noRsa.length) warnings.push(`No RSA PIN for ${noRsa.join(", ")}; the pension administrator will need it.`);
  return { slips, warnings };
}

export function periodLabel(start: string, end: string) {
  const s = new Date(`${start}T00:00:00Z`);
  const sameMonth = start.slice(0, 7) === end.slice(0, 7) && start.endsWith("-01") && addDays(end, 1).endsWith("-01");
  return sameMonth ? s.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }) : `${start} to ${end}`;
}

async function writeSlips(privateDb: SupabaseClient, tenantId: string, runId: string, slips: { employeeId: string; snapshot: PayslipSnapshot; result: PayResult }[]) {
  const del = await privateDb.schema("hotel").from("hr_payslips").delete().eq("tenant_id", tenantId).eq("run_id", runId);
  if (del.error) return friendlyDbError(del.error.message);
  if (!slips.length) return null;
  const { error } = await privateDb
    .schema("hotel")
    .from("hr_payslips")
    .insert(
      slips.map((s) => ({
        run_id: runId,
        tenant_id: tenantId,
        employee_id: s.employeeId,
        snapshot: s.snapshot,
        gross: s.result.gross,
        taxable_income_annual: s.result.taxableIncomeAnnual,
        paye: s.result.paye,
        pension_employee: s.result.pensionEmployee,
        pension_employer: s.result.pensionEmployer,
        nhf: s.result.nhf,
        nsitf: s.result.nsitf,
        itf: s.result.itf,
        other_deductions: s.result.otherDeductions,
        net_pay: s.result.netPay,
        breakdown: s.result,
      })),
    );
  return error ? friendlyDbError(error.message) : null;
}

export async function createPayRun(privateDb: SupabaseClient, service: SupabaseClient, tenantId: string, periodStart: string, periodEnd: string, actor: HrActor): Promise<{ id: string | null; error: string | null }> {
  if (periodEnd < periodStart) return { id: null, error: "The period ends before it starts." };
  const { slips, warnings } = await computeSlips(privateDb, service, tenantId, periodStart, periodEnd, {});
  const totals = sumPayslips(slips.map((s) => s.result));
  const { data, error } = await privateDb
    .schema("hotel")
    .from("hr_pay_runs")
    .insert({
      tenant_id: tenantId,
      period_start: periodStart,
      period_end: periodEnd,
      label: periodLabel(periodStart, periodEnd),
      rules_version: RULES_VERSION,
      totals: { summary: totals, warnings, oneOffs: {} },
      created_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: friendlyDbError(error?.message) };
  const slipError = await writeSlips(privateDb, tenantId, data.id, slips);
  if (slipError) return { id: data.id, error: slipError };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.payrun.created", entityType: "hr_pay_run", entityId: data.id, after: { periodStart, periodEnd, people: totals.people } });
  return { id: data.id as string, error: null };
}

/** Works a draft out again (after approving hours or changing pay), keeping one-off amounts. */
export async function recalculatePayRun(privateDb: SupabaseClient, service: SupabaseClient, tenantId: string, runId: string, actor: HrActor, oneOffPatch?: { employeeId: string; amount: number; note: string | null }): Promise<{ error: string | null }> {
  const existing = await getPayRun(privateDb, tenantId, runId);
  if (!existing) return { error: "Pay run not found." };
  if (existing.run.status !== "draft") return { error: "Only a draft can be changed." };
  const oneOffs = { ...existing.run.oneOffs };
  if (oneOffPatch) {
    if (oneOffPatch.amount === 0) delete oneOffs[oneOffPatch.employeeId];
    else oneOffs[oneOffPatch.employeeId] = { amount: oneOffPatch.amount, note: oneOffPatch.note };
  }
  const { slips, warnings } = await computeSlips(privateDb, service, tenantId, existing.run.periodStart, existing.run.periodEnd, oneOffs);
  const slipError = await writeSlips(privateDb, tenantId, runId, slips);
  if (slipError) return { error: slipError };
  const totals = sumPayslips(slips.map((s) => s.result));
  const { error } = await privateDb
    .schema("hotel")
    .from("hr_pay_runs")
    .update({ totals: { summary: totals, warnings, oneOffs }, rules_version: RULES_VERSION, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", runId);
  if (error) return { error: friendlyDbError(error.message) };
  if (oneOffPatch) await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.payrun.one_off", entityType: "hr_pay_run", entityId: runId, after: { employeeId: oneOffPatch.employeeId } });
  return { error: null };
}

async function accountIds(service: SupabaseClient, tenantId: string, codes: string[]) {
  const out = new Map<string, string>();
  for (const c of [...new Set(codes)]) {
    const id = await getAccountIdByCode(service, tenantId, c);
    if (!id) return { ids: null, missing: c };
    out.set(c, id);
  }
  return { ids: out, missing: null };
}

/** Approves a draft: payslips freeze and the payroll journal is posted to the books. */
export async function approvePayRun(privateDb: SupabaseClient, service: SupabaseClient, tenantId: string, runId: string, actor: HrActor): Promise<{ error: string | null }> {
  const existing = await getPayRun(privateDb, tenantId, runId);
  if (!existing) return { error: "Pay run not found." };
  const { run, slips } = existing;
  if (run.status !== "draft") return { error: "This pay run is already approved." };
  if (!slips.length || !run.totals) return { error: "There is nobody in this pay run." };
  const settings = await getHrSettings(service, tenantId);
  const codes = { expense: settings.expenseAccountCode, paye: settings.payeAccountCode, statutory: settings.statutoryAccountCode, net: settings.netPayAccountCode };
  const acc = await accountIds(service, tenantId, Object.values(codes));
  if (!acc.ids) return { error: `There is no active account ${acc.missing} in the chart of accounts. Change the account codes in HR settings.` };

  const lines = payRunJournalLines(run.totals).map((l) => ({ accountId: acc.ids!.get(codes[l.key])!, description: l.description, debit: l.debit, credit: l.credit }));
  const posted = await postJournalEntry(service, { tenantId, entryDate: run.periodEnd, memo: `Payroll: ${run.label}`, reference: `PAYROLL-${run.periodEnd}`, createdBy: actor.userId, lines });
  if (!posted.ok) return { error: `Couldn't post to the books: ${posted.error}` };

  const { error } = await privateDb
    .schema("hotel")
    .from("hr_pay_runs")
    .update({ status: "approved", approved_by: actor.userId, approved_at: new Date().toISOString(), journal_entry_id: posted.id, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", runId)
    .eq("status", "draft");
  if (error) {
    await reverseJournalEntry(service, { tenantId, journalEntryId: posted.id, actorUserId: actor.userId, memo: "Payroll approval failed" });
    return { error: friendlyDbError(error.message) };
  }
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.payrun.approved", entityType: "hr_pay_run", entityId: runId, after: { label: run.label, gross: run.totals.gross, net: run.totals.netPay, journal: posted.id } });
  return { error: null };
}

/** Records that net pay has gone out of the bank: moves it from net pay owed to the bank account. */
export async function markPayRunPaid(privateDb: SupabaseClient, service: SupabaseClient, tenantId: string, runId: string, paidOn: string, actor: HrActor): Promise<{ error: string | null }> {
  const existing = await getPayRun(privateDb, tenantId, runId);
  if (!existing) return { error: "Pay run not found." };
  const { run } = existing;
  if (run.status !== "approved" || !run.totals) return { error: "Approve the pay run first." };
  const settings = await getHrSettings(service, tenantId);
  const acc = await accountIds(service, tenantId, [settings.netPayAccountCode, settings.bankAccountCode]);
  if (!acc.ids) return { error: `There is no active account ${acc.missing} in the chart of accounts. Change the account codes in HR settings.` };
  const amount = run.totals.netPay;
  const posted = await postJournalEntry(service, {
    tenantId,
    entryDate: paidOn,
    memo: `Salaries paid: ${run.label}`,
    reference: `PAYROLL-PAID-${run.periodEnd}`,
    createdBy: actor.userId,
    lines: [
      { accountId: acc.ids.get(settings.netPayAccountCode)!, description: "Net pay settled", debit: amount, credit: 0 },
      { accountId: acc.ids.get(settings.bankAccountCode)!, description: "Salaries paid from bank", debit: 0, credit: amount },
    ],
  });
  if (!posted.ok) return { error: `Couldn't post to the books: ${posted.error}` };
  const { error } = await privateDb
    .schema("hotel")
    .from("hr_pay_runs")
    .update({ status: "paid", paid_by: actor.userId, paid_at: new Date(`${paidOn}T12:00:00Z`).toISOString(), paid_journal_entry_id: posted.id, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", runId);
  if (error) {
    await reverseJournalEntry(service, { tenantId, journalEntryId: posted.id, actorUserId: actor.userId, memo: "Payroll payment failed" });
    return { error: friendlyDbError(error.message) };
  }
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.payrun.paid", entityType: "hr_pay_run", entityId: runId, after: { paidOn, amount } });
  return { error: null };
}

/** Voids a run. An approved (unpaid) run has its journal reversed; a paid run can't be voided. */
export async function voidPayRun(privateDb: SupabaseClient, service: SupabaseClient, tenantId: string, runId: string, reason: string, actor: HrActor): Promise<{ error: string | null }> {
  const existing = await getPayRun(privateDb, tenantId, runId);
  if (!existing) return { error: "Pay run not found." };
  const { run } = existing;
  if (run.status === "paid") return { error: "Salaries from this run have been paid. Correct it in next month's run instead." };
  if (run.status === "void") return { error: "Already void." };
  if (run.status === "approved" && run.journalEntryId) {
    const rev = await reverseJournalEntry(service, { tenantId, journalEntryId: run.journalEntryId, actorUserId: actor.userId, memo: `Payroll voided: ${reason}` });
    if (!rev.ok) return { error: `Couldn't reverse the payroll journal: ${rev.error}` };
  }
  const { error } = await privateDb.schema("hotel").from("hr_pay_runs").update({ status: "void", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", runId);
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.payrun.voided", entityType: "hr_pay_run", entityId: runId, after: { reason } });
  return { error: null };
}

/* ---------- exports ---------- */

export type ExportKind = "register" | "bank" | "paye" | "pension" | "nhf";

type Cell = string | number | null;

/** The rows for each export. Row 1 is the header. */
export function exportRows(kind: ExportKind, run: PayRun, slips: Payslip[]): Cell[][] {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  switch (kind) {
    case "bank":
      return [
        ["Employee number", "Name", "Bank", "Account number", "Account name", "Amount (NGN)", "Narration"],
        // Only people the bank can pay; the pay run warns about anyone left out.
        ...slips.filter((s) => s.result.netPay > 0 && s.snapshot.bankAccountNumber).map((s) => [s.snapshot.employeeNumber, s.snapshot.name, s.snapshot.bankName, s.snapshot.bankAccountNumber, s.snapshot.bankAccountName ?? s.snapshot.name, r2(s.result.netPay), `Salary ${run.label}`]),
      ];
    case "paye":
      return [
        ["Employee number", "Name", "TIN", "State of residence", "Gross pay (month)", "Taxable income (year)", "PAYE (month)", "Note"],
        ...slips.map((s) => [s.snapshot.employeeNumber, s.snapshot.name, s.snapshot.tin, s.snapshot.stateOfResidence, r2(s.result.gross), r2(s.result.taxableIncomeAnnual), r2(s.result.paye), s.result.payeNote]),
      ];
    case "pension":
      return [
        ["Pension administrator (PFA)", "RSA PIN", "Employee number", "Name", "Pensionable pay", "Employee 8%", "Employer 10%", "Total"],
        ...slips
          .filter((s) => s.result.pensionEmployee > 0 || s.result.pensionEmployer > 0)
          .sort((a, b) => (a.snapshot.pfaName ?? "").localeCompare(b.snapshot.pfaName ?? ""))
          .map((s) => [s.snapshot.pfaName, s.snapshot.rsaPin, s.snapshot.employeeNumber, s.snapshot.name, r2(s.result.pensionBase), r2(s.result.pensionEmployee), r2(s.result.pensionEmployer), r2(s.result.pensionEmployee + s.result.pensionEmployer)]),
      ];
    case "nhf":
      return [
        ["NHF number", "Employee number", "Name", "Basic pay", "NHF 2.5%"],
        ...slips.filter((s) => s.result.nhf > 0).map((s) => [s.snapshot.nhfNumber, s.snapshot.employeeNumber, s.snapshot.name, r2(s.result.basic || s.result.hourlyPay + s.result.dailyPay), r2(s.result.nhf)]),
      ];
    case "register":
    default:
      return [
        ["Employee number", "Name", "Department", "Job", "Basis", "Basic", "Housing", "Transport", "Other allowances", "Hourly/daily pay", "Overtime", "One-off", "Unpaid leave", "Gross", "Pension (employee)", "NHF", "PAYE", "Other deductions", "Net pay", "Pension (employer)", "NSITF", "ITF", "Cost to hotel"],
        ...slips.map((s) => [
          s.snapshot.employeeNumber,
          s.snapshot.name,
          s.snapshot.department,
          s.snapshot.jobTitle,
          s.snapshot.payBasis,
          s.result.basic,
          s.result.housing,
          s.result.transport,
          s.result.otherAllowances,
          r2(s.result.hourlyPay + s.result.dailyPay),
          s.result.overtimePay,
          s.result.oneOffAdditions,
          s.result.unpaidLeaveDeduction,
          s.result.gross,
          s.result.pensionEmployee,
          s.result.nhf,
          s.result.paye,
          s.result.otherDeductions,
          s.result.netPay,
          s.result.pensionEmployer,
          s.result.nsitf,
          s.result.itf,
          s.result.employerCost,
        ]),
        ...(run.totals
          ? [["", "Total", "", "", "", "", "", "", "", "", "", "", "", run.totals.gross, run.totals.pensionEmployee, run.totals.nhf, run.totals.paye, run.totals.otherDeductions, run.totals.netPay, run.totals.pensionEmployer, run.totals.nsitf, run.totals.itf, run.totals.employerCost] as Cell[]]
          : []),
      ];
  }
}
