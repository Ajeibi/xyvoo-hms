import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_LEAVE_TYPES, type HrSettings, type LeaveType } from "@/lib/hms/hr/hr-shared";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (v: unknown, d = 0) => {
  const x = typeof v === "number" ? v : Number.parseFloat(String(v));
  return Number.isFinite(x) ? x : d;
};

export const DEFAULT_HR_SETTINGS: HrSettings = {
  departments: ["Front desk", "Housekeeping", "Restaurant and bar", "Kitchen", "Maintenance", "Security", "Accounts", "Management"],
  weekStartsOn: 1,
  minRestHours: 11,
  maxWeeklyHours: 48,
  lateGraceMinutes: 10,
  overtimeAfterWeeklyHours: 40,
  overtimeMultiplier: 1.5,
  kioskEnabled: false,
  kioskSelfService: true,
  kioskPhoto: false,
  hasKioskLink: false,
  pensionEnabled: true,
  nsitfEnabled: true,
  itfEnabled: false,
  payDay: 25,
  expenseAccountCode: "5100",
  payeAccountCode: "2200",
  statutoryAccountCode: "2100",
  netPayAccountCode: "2100",
  bankAccountCode: "1010",
};

export function mapSettings(row: any | null): HrSettings {
  if (!row) return DEFAULT_HR_SETTINGS;
  return {
    departments: Array.isArray(row.departments) && row.departments.length ? row.departments : DEFAULT_HR_SETTINGS.departments,
    weekStartsOn: num(row.week_starts_on, 1),
    minRestHours: num(row.min_rest_hours, 11),
    maxWeeklyHours: num(row.max_weekly_hours, 48),
    lateGraceMinutes: num(row.late_grace_minutes, 10),
    overtimeAfterWeeklyHours: num(row.overtime_after_weekly_hours, 40),
    overtimeMultiplier: num(row.overtime_multiplier, 1.5),
    kioskEnabled: Boolean(row.kiosk_enabled),
    kioskSelfService: row.kiosk_self_service !== false,
    kioskPhoto: Boolean(row.kiosk_photo),
    hasKioskLink: Boolean(row.kiosk_token_hash),
    pensionEnabled: row.pension_enabled !== false,
    nsitfEnabled: row.nsitf_enabled !== false,
    itfEnabled: Boolean(row.itf_enabled),
    payDay: num(row.pay_day, 25),
    expenseAccountCode: row.expense_account_code ?? "5100",
    payeAccountCode: row.paye_account_code ?? "2200",
    statutoryAccountCode: row.statutory_account_code ?? "2100",
    netPayAccountCode: row.net_pay_account_code ?? "2100",
    bankAccountCode: row.bank_account_code ?? "1010",
  };
}

export async function getHrSettings(service: SupabaseClient, tenantId: string): Promise<HrSettings> {
  const { data } = await service.schema("hotel").from("hr_settings").select("*").eq("tenant_id", tenantId).maybeSingle();
  return mapSettings(data);
}

export type HrSettingsPatch = Partial<Omit<HrSettings, "hasKioskLink">>;

export async function saveHrSettings(service: SupabaseClient, tenantId: string, patch: HrSettingsPatch): Promise<{ error: string | null }> {
  const row: Record<string, unknown> = { tenant_id: tenantId, updated_at: new Date().toISOString() };
  const map: Record<string, string> = {
    departments: "departments",
    weekStartsOn: "week_starts_on",
    minRestHours: "min_rest_hours",
    maxWeeklyHours: "max_weekly_hours",
    lateGraceMinutes: "late_grace_minutes",
    overtimeAfterWeeklyHours: "overtime_after_weekly_hours",
    overtimeMultiplier: "overtime_multiplier",
    kioskEnabled: "kiosk_enabled",
    kioskSelfService: "kiosk_self_service",
    kioskPhoto: "kiosk_photo",
    pensionEnabled: "pension_enabled",
    nsitfEnabled: "nsitf_enabled",
    itfEnabled: "itf_enabled",
    payDay: "pay_day",
    expenseAccountCode: "expense_account_code",
    payeAccountCode: "paye_account_code",
    statutoryAccountCode: "statutory_account_code",
    netPayAccountCode: "net_pay_account_code",
    bankAccountCode: "bank_account_code",
  };
  for (const [k, v] of Object.entries(patch)) if (map[k] && v !== undefined) row[map[k]] = v;
  const { error } = await service.schema("hotel").from("hr_settings").upsert(row, { onConflict: "tenant_id" });
  return { error: error ? "Couldn't save HR settings." : null };
}

export const hashKioskToken = (token: string) => createHash("sha256").update(`hr-kiosk:${token}`).digest("hex");

/** Makes a new clock screen link. The old link stops working at once. Returns the raw token (shown once). */
export async function rotateKioskToken(service: SupabaseClient, tenantId: string): Promise<{ token: string | null; error: string | null }> {
  const token = randomBytes(24).toString("base64url");
  const { error } = await service
    .schema("hotel")
    .from("hr_settings")
    .upsert({ tenant_id: tenantId, kiosk_token_hash: hashKioskToken(token), kiosk_enabled: true, updated_at: new Date().toISOString() }, { onConflict: "tenant_id" });
  return error ? { token: null, error: "Couldn't make a new clock screen link." } : { token, error: null };
}

/* ---------- leave types ---------- */

export function mapLeaveType(r: any): LeaveType {
  return {
    id: r.id,
    name: r.name,
    paid: Boolean(r.paid),
    daysPerYear: num(r.days_per_year),
    carryOverMax: num(r.carry_over_max),
    countsAgainstBalance: r.counts_against_balance !== false,
    active: r.active !== false,
  };
}

/** The hotel's leave types; the Labour Act defaults are added the first time they are needed. */
export async function listLeaveTypes(service: SupabaseClient, tenantId: string, opts: { activeOnly?: boolean } = {}): Promise<LeaveType[]> {
  const load = async () =>
    (await service.schema("hotel").from("hr_leave_types").select("*").eq("tenant_id", tenantId).order("sort_order").order("name")).data ?? [];
  let rows = await load();
  if (rows.length === 0) {
    await service
      .schema("hotel")
      .from("hr_leave_types")
      .upsert(
        DEFAULT_LEAVE_TYPES.map((t, i) => ({
          tenant_id: tenantId,
          name: t.name,
          paid: t.paid,
          days_per_year: t.daysPerYear,
          carry_over_max: t.carryOverMax,
          counts_against_balance: t.countsAgainstBalance,
          sort_order: i,
        })),
        { onConflict: "tenant_id,name", ignoreDuplicates: true },
      );
    rows = await load();
  }
  const types = rows.map(mapLeaveType);
  return opts.activeOnly ? types.filter((t) => t.active) : types;
}

export async function saveLeaveType(
  service: SupabaseClient,
  tenantId: string,
  input: { id?: string; name: string; paid: boolean; daysPerYear: number; carryOverMax: number; countsAgainstBalance: boolean; active: boolean },
): Promise<{ error: string | null }> {
  const row = {
    tenant_id: tenantId,
    name: input.name.trim(),
    paid: input.paid,
    days_per_year: input.daysPerYear,
    carry_over_max: input.carryOverMax,
    counts_against_balance: input.countsAgainstBalance,
    active: input.active,
  };
  const { error } = input.id
    ? await service.schema("hotel").from("hr_leave_types").update(row).eq("tenant_id", tenantId).eq("id", input.id)
    : await service.schema("hotel").from("hr_leave_types").insert(row);
  if (error) return { error: error.code === "23505" ? "There is already a leave type with that name." : "Couldn't save the leave type." };
  return { error: null };
}

/* ---------- who may see pay ---------- */

export async function listAccessGrants(service: SupabaseClient, tenantId: string): Promise<string[]> {
  const { data } = await service.schema("hotel").from("hr_access_grants").select("user_id").eq("tenant_id", tenantId);
  return (data ?? []).map((r: any) => r.user_id as string);
}

export async function setAccessGrant(service: SupabaseClient, tenantId: string, userId: string, granted: boolean, by: string): Promise<{ error: string | null }> {
  if (granted) {
    const { data: member } = await service.schema("hotel").from("memberships").select("user_id").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
    if (!member) return { error: "That login is not part of this hotel." };
    const { error } = await service.schema("hotel").from("hr_access_grants").upsert({ tenant_id: tenantId, user_id: userId, granted_by: by }, { onConflict: "tenant_id,user_id" });
    return { error: error ? "Couldn't give access." : null };
  }
  const { error } = await service.schema("hotel").from("hr_access_grants").delete().eq("tenant_id", tenantId).eq("user_id", userId);
  return { error: error ? "Couldn't remove access." : null };
}

/** Every login in the hotel except owners, for the "who may see pay" list. */
export async function listGrantableLogins(service: SupabaseClient, tenantId: string): Promise<{ userId: string; name: string; role: string }[]> {
  const { data: members } = await service.schema("hotel").from("memberships").select("user_id, role").eq("tenant_id", tenantId).neq("role", "owner");
  const out = await Promise.all(
    (members ?? []).map(async (m: any) => {
      const { data } = await service.auth.admin.getUserById(m.user_id);
      const meta = (data.user?.user_metadata ?? {}) as Record<string, unknown>;
      const dept = typeof meta.department_role === "string" ? meta.department_role : null;
      const name = (typeof meta.full_name === "string" && meta.full_name.trim()) || data.user?.email || "Staff login";
      return { userId: m.user_id as string, name: name as string, role: dept ?? (m.role === "admin" ? "Admin" : "Staff") };
    }),
  );
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
