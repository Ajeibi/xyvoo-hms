import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import {
  EMPTY_PAY_PROFILE,
  friendlyDbError,
  fullNameOf,
  type Employee,
  type EmployeeDocument,
  type EmployeePrivate,
  type EmployeeStatus,
  type EmploymentType,
  type PayProfile,
} from "@/lib/hms/hr/hr-shared";
import type { HrActor } from "@/lib/hms/hr/hr-api";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : 0;
};

export function mapEmployee(r: any): Employee {
  const base = { firstName: r.first_name as string, lastName: r.last_name as string, preferredName: (r.preferred_name as string | null) ?? null };
  return {
    id: r.id,
    employeeNumber: r.employee_number,
    ...base,
    fullName: fullNameOf(base),
    jobTitle: r.job_title ?? null,
    department: r.department ?? null,
    employmentType: r.employment_type,
    startDate: r.start_date ?? null,
    endDate: r.end_date ?? null,
    leavingReason: r.leaving_reason ?? null,
    status: r.status,
    workEmail: r.work_email ?? null,
    workPhone: r.work_phone ?? null,
    userId: r.user_id ?? null,
    contractedHoursWeek: r.contracted_hours_week === null || r.contracted_hours_week === undefined ? null : num(r.contracted_hours_week),
    hasPin: Boolean(r.clock_pin_hash),
    colour: r.colour ?? null,
  };
}

const EMPLOYEE_COLUMNS =
  "id, employee_number, first_name, last_name, preferred_name, job_title, department, employment_type, start_date, end_date, leaving_reason, status, work_email, work_phone, user_id, contracted_hours_week, clock_pin_hash, colour";

export async function listEmployees(
  service: SupabaseClient,
  tenantId: string,
  opts: { status?: EmployeeStatus | "current"; department?: string | null } = {},
): Promise<Employee[]> {
  let q = service.schema("hotel").from("hr_employees").select(EMPLOYEE_COLUMNS).eq("tenant_id", tenantId).order("first_name").order("last_name").limit(2000);
  if (opts.status === "current") q = q.neq("status", "left");
  else if (opts.status) q = q.eq("status", opts.status);
  if (opts.department) q = q.eq("department", opts.department);
  const { data } = await q;
  return (data ?? []).map(mapEmployee);
}

export async function getEmployee(service: SupabaseClient, tenantId: string, id: string): Promise<Employee | null> {
  const { data } = await service.schema("hotel").from("hr_employees").select(EMPLOYEE_COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return data ? mapEmployee(data) : null;
}

export type EmployeeInput = {
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  employmentType: EmploymentType;
  startDate?: string | null;
  workEmail?: string | null;
  workPhone?: string | null;
  userId?: string | null;
  contractedHoursWeek?: number | null;
  colour?: string | null;
};

const toRow = (i: Partial<EmployeeInput>) => {
  const row: Record<string, unknown> = {};
  if (i.firstName !== undefined) row.first_name = i.firstName.trim();
  if (i.lastName !== undefined) row.last_name = i.lastName.trim();
  if (i.preferredName !== undefined) row.preferred_name = i.preferredName?.trim() || null;
  if (i.jobTitle !== undefined) row.job_title = i.jobTitle?.trim() || null;
  if (i.department !== undefined) row.department = i.department || null;
  if (i.employmentType !== undefined) row.employment_type = i.employmentType;
  if (i.startDate !== undefined) row.start_date = i.startDate || null;
  if (i.workEmail !== undefined) row.work_email = i.workEmail?.trim().toLowerCase() || null;
  if (i.workPhone !== undefined) row.work_phone = i.workPhone?.trim() || null;
  if (i.userId !== undefined) row.user_id = i.userId || null;
  if (i.contractedHoursWeek !== undefined) row.contracted_hours_week = i.contractedHoursWeek ?? null;
  if (i.colour !== undefined) row.colour = i.colour || null;
  return row;
};

export async function createEmployee(service: SupabaseClient, tenantId: string, input: EmployeeInput, actor: HrActor): Promise<{ id: string | null; error: string | null }> {
  const { data: n, error: nErr } = await service.schema("hotel").rpc("next_hr_number", { p_tenant: tenantId, p_kind: "employee" });
  if (nErr) return { id: null, error: "Couldn't number the new record. Has the HR migration been run?" };
  const employeeNumber = `EMP-${String(n).padStart(4, "0")}`;
  const { data, error } = await service
    .schema("hotel")
    .from("hr_employees")
    .insert({ tenant_id: tenantId, employee_number: employeeNumber, ...toRow(input) })
    .select("id")
    .single();
  if (error || !data) return { id: null, error: friendlyDbError(error?.message) };
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "hr.employee.created",
    entityType: "hr_employee",
    entityId: data.id,
    after: { employeeNumber, name: `${input.firstName} ${input.lastName}`, department: input.department ?? null, jobTitle: input.jobTitle ?? null },
  });
  return { id: data.id as string, error: null };
}

export async function updateEmployee(service: SupabaseClient, tenantId: string, id: string, input: Partial<EmployeeInput>, actor: HrActor): Promise<{ error: string | null }> {
  const before = await getEmployee(service, tenantId, id);
  if (!before) return { error: "Staff record not found." };
  const row = toRow(input);
  const { error } = await service.schema("hotel").from("hr_employees").update({ ...row, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.employee.updated", entityType: "hr_employee", entityId: id, after: { fields: Object.keys(input) } });
  return { error: null };
}

export async function setEmployeeStatus(
  service: SupabaseClient,
  tenantId: string,
  id: string,
  status: EmployeeStatus,
  details: { endDate?: string | null; leavingReason?: string | null },
  actor: HrActor,
): Promise<{ error: string | null }> {
  const before = await getEmployee(service, tenantId, id);
  if (!before) return { error: "Staff record not found." };
  if (status === "left" && !details.endDate) return { error: "Add the last working day." };
  const row: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "left") {
    row.end_date = details.endDate;
    row.leaving_reason = details.leavingReason?.trim() || null;
    row.clock_pin_hash = null; // a leaver can't clock in
  } else {
    row.end_date = null;
    row.leaving_reason = null;
  }
  const { error } = await service.schema("hotel").from("hr_employees").update(row).eq("tenant_id", tenantId).eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  if (status === "left") {
    // Their future shifts go back to the open pool.
    await service
      .schema("hotel")
      .from("hr_shifts")
      .update({ employee_id: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("employee_id", id)
      .gt("shift_date", details.endDate as string)
      .neq("status", "cancelled");
  }
  await writeAuditLog({
    tenantId,
    actorUserId: actor.userId,
    action: "hr.employee.status",
    entityType: "hr_employee",
    entityId: id,
    before: { status: before.status },
    after: { status, endDate: details.endDate ?? null },
  });
  return { error: null };
}

/** PINs are stored hashed with the hotel's id, so the same PIN in two hotels doesn't match. */
export const hashPin = (tenantId: string, pin: string) => createHash("sha256").update(`hr-pin:${tenantId}:${pin}`).digest("hex");

export async function setClockPin(service: SupabaseClient, tenantId: string, id: string, pin: string | null, actor: HrActor): Promise<{ error: string | null }> {
  if (pin !== null && !/^\d{4,6}$/.test(pin)) return { error: "A PIN is 4 to 6 numbers." };
  if (pin !== null && /^(\d)\1+$/.test(pin)) return { error: "Choose a PIN that isn't the same number repeated." };
  const { error } = await service
    .schema("hotel")
    .from("hr_employees")
    .update({ clock_pin_hash: pin ? hashPin(tenantId, pin) : null, clock_pin_set_at: pin ? new Date().toISOString() : null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id);
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: pin ? "hr.employee.pin_set" : "hr.employee.pin_cleared", entityType: "hr_employee", entityId: id });
  return { error: null };
}

/* ---------- private details: always through the caller's own client (row-level security) ---------- */

const PRIVATE_MAP: Record<keyof EmployeePrivate, string> = {
  dateOfBirth: "date_of_birth",
  gender: "gender",
  maritalStatus: "marital_status",
  homeAddress: "home_address",
  stateOfResidence: "state_of_residence",
  personalPhone: "personal_phone",
  personalEmail: "personal_email",
  nextOfKinName: "next_of_kin_name",
  nextOfKinRelationship: "next_of_kin_relationship",
  nextOfKinPhone: "next_of_kin_phone",
  nin: "nin",
  tin: "tin",
  bankName: "bank_name",
  bankAccountNumber: "bank_account_number",
  bankAccountName: "bank_account_name",
  pfaName: "pfa_name",
  rsaPin: "rsa_pin",
  nhfNumber: "nhf_number",
  guarantorName: "guarantor_name",
  guarantorPhone: "guarantor_phone",
  notes: "notes",
};

export function mapPrivate(r: any | null): EmployeePrivate {
  const out = {} as EmployeePrivate;
  for (const [k, col] of Object.entries(PRIVATE_MAP)) (out as any)[k] = r?.[col] ?? null;
  return out;
}

export async function getEmployeePrivate(privateDb: SupabaseClient, tenantId: string, employeeId: string): Promise<EmployeePrivate | null> {
  const { data, error } = await privateDb.schema("hotel").from("hr_employee_private").select("*").eq("tenant_id", tenantId).eq("employee_id", employeeId).maybeSingle();
  if (error) return null;
  return mapPrivate(data);
}

export async function listEmployeePrivate(privateDb: SupabaseClient, tenantId: string): Promise<Map<string, EmployeePrivate>> {
  const { data } = await privateDb.schema("hotel").from("hr_employee_private").select("*").eq("tenant_id", tenantId).limit(5000);
  return new Map((data ?? []).map((r: any) => [r.employee_id as string, mapPrivate(r)]));
}

export async function saveEmployeePrivate(
  privateDb: SupabaseClient,
  tenantId: string,
  employeeId: string,
  input: Partial<EmployeePrivate>,
  actor: HrActor,
): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = { employee_id: employeeId, tenant_id: tenantId, updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(input)) {
    const col = PRIVATE_MAP[k as keyof EmployeePrivate];
    if (col) row[col] = typeof v === "string" ? v.trim() || null : (v ?? null);
  }
  const { error } = await privateDb.schema("hotel").from("hr_employee_private").upsert(row, { onConflict: "employee_id" });
  if (error) return { error: friendlyDbError(error.message) };
  // The log names the fields that changed, never their values.
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.employee.private_updated", entityType: "hr_employee", entityId: employeeId, after: { fields: Object.keys(input) } });
  return { error: null };
}

const PAY_MAP: Record<keyof PayProfile, string> = {
  payBasis: "pay_basis",
  basicMonthly: "basic_monthly",
  housingMonthly: "housing_monthly",
  transportMonthly: "transport_monthly",
  otherAllowancesMonthly: "other_allowances_monthly",
  hourlyRate: "hourly_rate",
  dailyRate: "daily_rate",
  annualRentPaid: "annual_rent_paid",
  otherReliefsAnnual: "other_reliefs_annual",
  monthlyDeductions: "monthly_deductions",
  monthlyDeductionsNote: "monthly_deductions_note",
  pensionOptIn: "pension_opt_in",
  nhfOptIn: "nhf_opt_in",
  payeExempt: "paye_exempt",
};

export function mapPayProfile(r: any | null): PayProfile {
  if (!r) return { ...EMPTY_PAY_PROFILE };
  return {
    payBasis: r.pay_basis,
    basicMonthly: num(r.basic_monthly),
    housingMonthly: num(r.housing_monthly),
    transportMonthly: num(r.transport_monthly),
    otherAllowancesMonthly: num(r.other_allowances_monthly),
    hourlyRate: num(r.hourly_rate),
    dailyRate: num(r.daily_rate),
    annualRentPaid: num(r.annual_rent_paid),
    otherReliefsAnnual: num(r.other_reliefs_annual),
    monthlyDeductions: num(r.monthly_deductions),
    monthlyDeductionsNote: r.monthly_deductions_note ?? null,
    pensionOptIn: r.pension_opt_in !== false,
    nhfOptIn: Boolean(r.nhf_opt_in),
    payeExempt: Boolean(r.paye_exempt),
  };
}

export async function getPayProfile(privateDb: SupabaseClient, tenantId: string, employeeId: string): Promise<PayProfile | null> {
  const { data, error } = await privateDb.schema("hotel").from("hr_pay_profiles").select("*").eq("tenant_id", tenantId).eq("employee_id", employeeId).maybeSingle();
  if (error) return null;
  return mapPayProfile(data);
}

/** Every pay profile the caller may see. Empty for anyone the database doesn't let through. */
export async function listPayProfiles(privateDb: SupabaseClient, tenantId: string): Promise<Map<string, PayProfile>> {
  const { data } = await privateDb.schema("hotel").from("hr_pay_profiles").select("*").eq("tenant_id", tenantId).limit(5000);
  return new Map((data ?? []).map((r: any) => [r.employee_id as string, mapPayProfile(r)]));
}

export async function savePayProfile(privateDb: SupabaseClient, tenantId: string, employeeId: string, input: PayProfile, actor: HrActor): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = { employee_id: employeeId, tenant_id: tenantId, updated_at: new Date().toISOString() };
  for (const [k, col] of Object.entries(PAY_MAP)) row[col] = (input as any)[k];
  const { error } = await privateDb.schema("hotel").from("hr_pay_profiles").upsert(row, { onConflict: "employee_id" });
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.employee.pay_updated", entityType: "hr_employee", entityId: employeeId, after: { payBasis: input.payBasis } });
  return { error: null };
}

/* ---------- documents (private) ---------- */

const mapDoc = (r: any): EmployeeDocument => ({
  id: r.id,
  employeeId: r.employee_id,
  kind: r.kind,
  reference: r.reference ?? null,
  receivedOn: r.received_on ?? null,
  expiresOn: r.expires_on ?? null,
  note: r.note ?? null,
});

export async function listDocuments(privateDb: SupabaseClient, tenantId: string, employeeId?: string): Promise<EmployeeDocument[]> {
  let q = privateDb.schema("hotel").from("hr_employee_documents").select("*").eq("tenant_id", tenantId).order("created_at");
  if (employeeId) q = q.eq("employee_id", employeeId);
  const { data } = await q;
  return (data ?? []).map(mapDoc);
}

export async function addDocument(
  privateDb: SupabaseClient,
  tenantId: string,
  employeeId: string,
  input: { kind: string; reference?: string | null; receivedOn?: string | null; expiresOn?: string | null; note?: string | null },
  actor: HrActor,
): Promise<{ error: string | null }> {
  const { error } = await privateDb.schema("hotel").from("hr_employee_documents").insert({
    tenant_id: tenantId,
    employee_id: employeeId,
    kind: input.kind.trim(),
    reference: input.reference?.trim() || null,
    received_on: input.receivedOn || null,
    expires_on: input.expiresOn || null,
    note: input.note?.trim() || null,
  });
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.document.added", entityType: "hr_employee", entityId: employeeId, after: { kind: input.kind } });
  return { error: null };
}

export async function deleteDocument(privateDb: SupabaseClient, tenantId: string, employeeId: string, documentId: string, actor: HrActor): Promise<{ error: string | null }> {
  const { error } = await privateDb.schema("hotel").from("hr_employee_documents").delete().eq("tenant_id", tenantId).eq("employee_id", employeeId).eq("id", documentId);
  if (error) return { error: friendlyDbError(error.message) };
  await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.document.removed", entityType: "hr_employee", entityId: employeeId });
  return { error: null };
}
