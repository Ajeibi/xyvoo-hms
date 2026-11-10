import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import type { HrActor } from "@/lib/hms/hr/hr-api";
import { listEmployeePrivate, listEmployees } from "@/lib/hms/hr/hr-employees";
import { getPayRun, type Payslip } from "@/lib/hms/hr/hr-payroll";
import { naira } from "@/lib/hms/hr/hr-shared";
import { detailsPanel } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";

/*
 * Emails each person their payslip once a run is approved. Everything is read through the
 * caller's own client (`privateDb`), so only people who may see pay can send them. A payslip goes
 * to the person's personal email, or their work email if there is none.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type PayslipSend = { sentTo: string; sentAt: string };

/** The last time each payslip in a run was emailed, keyed by payslip id. */
export async function listPayslipSends(privateDb: SupabaseClient, tenantId: string, payslipIds: string[]): Promise<Map<string, PayslipSend>> {
  const out = new Map<string, PayslipSend>();
  if (!payslipIds.length) return out;
  const { data } = await privateDb.schema("hotel").from("hr_payslip_sends").select("payslip_id, sent_to, sent_at").eq("tenant_id", tenantId).in("payslip_id", payslipIds).order("sent_at", { ascending: true });
  for (const r of data ?? []) out.set(r.payslip_id as string, { sentTo: r.sent_to as string, sentAt: r.sent_at as string });
  return out;
}

function payslipRows(s: Payslip) {
  const r = s.result;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, v: number) => {
    if (v) rows.push({ label, value: naira(v) });
  };
  add("Basic salary", r.basic);
  add("Housing allowance", r.housing);
  add("Transport allowance", r.transport);
  add("Other allowances", r.otherAllowances);
  add(`Hourly pay (${s.snapshot.regularHours}h)`, r.hourlyPay);
  add(`Daily pay (${s.snapshot.daysWorked} days)`, r.dailyPay);
  add(`Overtime (${s.snapshot.overtimeHours}h)`, r.overtimePay);
  add("One-off payment", r.oneOffAdditions);
  rows.push({ label: "Gross pay", value: naira(r.gross) });
  add("PAYE tax", r.paye);
  add("Pension (8%)", r.pensionEmployee);
  add("National Housing Fund", r.nhf);
  add("Other deductions", r.otherDeductions);
  rows.push({ label: "Take-home pay", value: naira(r.netPay) });
  return rows;
}

export async function emailPayslips(
  privateDb: SupabaseClient,
  service: SupabaseClient,
  tenantId: string,
  runId: string,
  actor: HrActor,
  opts: { employeeId?: string } = {},
): Promise<{ error: string | null; sent: number; noEmail: string[]; failed: string[] }> {
  const found = await getPayRun(privateDb, tenantId, runId);
  if (!found) return { error: "Pay run not found.", sent: 0, noEmail: [], failed: [] };
  if (found.run.status !== "approved" && found.run.status !== "paid") return { error: "Approve the pay run before sending payslips.", sent: 0, noEmail: [], failed: [] };
  const slips = opts.employeeId ? found.slips.filter((s) => s.employeeId === opts.employeeId) : found.slips;
  if (!slips.length) return { error: "No payslips to send.", sent: 0, noEmail: [], failed: [] };

  const [employees, personal, tenant] = await Promise.all([
    listEmployees(service, tenantId),
    listEmployeePrivate(privateDb, tenantId),
    service.from("tenants").select("name, display_name").eq("id", tenantId).maybeSingle(),
  ]);
  const hotel = ((tenant.data as any)?.display_name as string | null) || ((tenant.data as any)?.name as string | null) || "Your hotel";
  const work = new Map(employees.map((e) => [e.id, e.workEmail]));

  let sent = 0;
  const noEmail: string[] = [];
  const failed: string[] = [];
  for (const s of slips) {
    const to = (personal.get(s.employeeId)?.personalEmail || work.get(s.employeeId) || "").trim();
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      noEmail.push(s.snapshot.name);
      continue;
    }
    const rows = payslipRows(s);
    try {
      await sendBrandedEmail({
        to,
        subject: `${hotel}: your payslip for ${found.run.label}`,
        text: `Hello ${s.snapshot.name},\n\nYour payslip for ${found.run.label} from ${hotel}:\n${rows.map((r) => `${r.label}: ${r.value}`).join("\n")}\n\nAsk HR if anything looks wrong.`,
        layout: {
          preheader: `Take-home pay ${naira(s.result.netPay)} for ${found.run.label}`,
          title: `Your payslip · ${found.run.label}`,
          intro: `Hello ${s.snapshot.name}, here is your pay from ${hotel}. ${s.snapshot.employeeNumber}${s.snapshot.jobTitle ? ` · ${s.snapshot.jobTitle}` : ""}.`,
          body: detailsPanel(rows),
          footerNote: "This payslip is private. If anything looks wrong, speak to HR. Your employer also paid pension and other contributions on top of this.",
        },
      });
    } catch (e) {
      console.warn("[payslip email]", e instanceof Error ? e.message : e);
      failed.push(s.snapshot.name);
      continue;
    }
    await privateDb.schema("hotel").from("hr_payslip_sends").insert({ payslip_id: s.id, tenant_id: tenantId, sent_to: to, sent_by: actor.userId });
    sent += 1;
  }
  // Names only: no addresses or amounts in the audit log.
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.payslips.emailed", entityType: "hr_pay_run", entityId: runId, after: { sent, noEmail: noEmail.length, failed: failed.length } });
  return { error: null, sent, noEmail, failed };
}
