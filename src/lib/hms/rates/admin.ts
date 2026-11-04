import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { planFromRow, priceFromRow, restrictionFromRow } from "@/lib/hms/rates/book";
import { wouldLoop } from "@/lib/hms/rates/pricing";
import type { PriceRule, RatePlan, Restriction } from "@/lib/hms/rates/types";

/*
 * Changing the rate book: plans, price rules and restrictions. Every change is checked here (so a
 * screen, an import or a channel manager all get the same rules) and written to the audit log with
 * before and after.
 */

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-12-24.");
const dow = z.array(z.number().int().min(0).max(6)).max(7).nullable().optional();

export const PlanInput = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{1,24}$/, "The code can use letters, numbers, - and _ (up to 24)."),
  name: z.string().trim().min(2, "Give the plan a name.").max(80),
  description: z.string().trim().max(400).nullable().optional(),
  parentPlanId: z.string().uuid().nullable().optional(),
  deriveKind: z.enum(["percent", "amount"]).nullable().optional(),
  deriveValue: z.coerce.number().min(-10_000_000).max(10_000_000).optional(),
  boardBasis: z.string().trim().min(2).max(40).default("Room only"),
  refundable: z.boolean().default(true),
  prepayRequired: z.boolean().default(false),
  roomTypeCodes: z.array(z.string().min(1).max(80)).max(50).nullable().optional(),
  channels: z.array(z.string().min(1).max(30)).max(10).default([]),
  arCustomerId: z.string().uuid().nullable().optional(),
  sellFrom: day.nullable().optional(),
  sellTo: day.nullable().optional(),
  active: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export type PlanInputType = z.infer<typeof PlanInput>;

export async function savePlan(
  db: SupabaseClient,
  ctx: { tenantId: string; userId: string; roomTypeIds: string[] },
  input: PlanInputType,
): Promise<Result<RatePlan>> {
  const hotel = db.schema("hotel");
  const { data: all } = await hotel.from("rate_plans").select("*").eq("tenant_id", ctx.tenantId);
  const plans = (all ?? []).map(planFromRow);
  const existing = input.id ? plans.find((p) => p.id === input.id) : undefined;
  if (input.id && !existing) return fail("That plan wasn't found.");

  const parentId = input.parentPlanId ?? null;
  if (existing?.isDefault && parentId) return fail("The default plan can't follow another plan.");
  if (existing?.isDefault && !input.active) return fail("The default plan can't be switched off. Make another plan the default first.");
  if (parentId) {
    if (!plans.some((p) => p.id === parentId)) return fail("The plan it follows wasn't found.");
    if (input.id && wouldLoop(plans, input.id, parentId)) return fail("A plan can't follow itself, even through other plans.");
    if (!input.deriveKind) return fail("Say whether it adds a percentage or an amount to the other plan.");
  }
  if (!parentId && input.deriveKind) return fail("Choose which plan this one follows.");
  const codeTaken = plans.some((p) => p.code.toLowerCase() === input.code.toLowerCase() && p.id !== input.id);
  if (codeTaken) return fail("Another plan already uses that code.");
  if (input.sellFrom && input.sellTo && input.sellFrom > input.sellTo) return fail("The sales window ends before it starts.");
  const types = input.roomTypeCodes?.filter(Boolean) ?? [];
  if (types.some((t) => !ctx.roomTypeIds.includes(t))) return fail("One of the room types wasn't found.");
  if (input.arCustomerId) {
    const { data: c } = await hotel.from("ar_customers").select("id").eq("tenant_id", ctx.tenantId).eq("id", input.arCustomerId).maybeSingle();
    if (!c) return fail("That company wasn't found.");
  }

  const row = {
    tenant_id: ctx.tenantId,
    code: input.code.toUpperCase(),
    name: input.name,
    description: input.description?.trim() || null,
    parent_plan_id: parentId,
    derive_kind: parentId ? input.deriveKind ?? null : null,
    derive_value: parentId ? input.deriveValue ?? 0 : 0,
    board_basis: input.boardBasis,
    refundable: input.refundable,
    prepay_required: input.prepayRequired,
    room_type_codes: types.length > 0 ? types : null,
    channels: input.channels,
    ar_customer_id: input.arCustomerId ?? null,
    sell_from: input.sellFrom ?? null,
    sell_to: input.sellTo ?? null,
    active: input.active,
    sort_order: input.sortOrder,
    updated_at: new Date().toISOString(),
  };
  const query = existing
    ? hotel.from("rate_plans").update(row).eq("tenant_id", ctx.tenantId).eq("id", existing.id)
    : hotel.from("rate_plans").insert({ ...row, created_by: ctx.userId });
  const { data, error } = await query.select("*").single();
  if (error || !data) return fail(error?.message.includes("uq_rate_plans_code") ? "Another plan already uses that code." : "The plan couldn't be saved.");
  const saved = planFromRow(data);
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: existing ? "rate_plan_updated" : "rate_plan_created",
    entityType: "rate_plan",
    entityId: saved.id,
    before: existing ?? null,
    after: saved,
  });
  return { ok: true, value: saved };
}

export async function makeDefaultPlan(db: SupabaseClient, ctx: { tenantId: string; userId: string }, planId: string): Promise<Result<true>> {
  const hotel = db.schema("hotel");
  const { data: plan } = await hotel.from("rate_plans").select("*").eq("tenant_id", ctx.tenantId).eq("id", planId).maybeSingle();
  if (!plan) return fail("That plan wasn't found.");
  if (plan.parent_plan_id) return fail("A plan that follows another plan can't be the default. Choose a standalone plan.");
  if (plan.active === false) return fail("Switch the plan on first.");
  await hotel.from("rate_plans").update({ is_default: false }).eq("tenant_id", ctx.tenantId).eq("is_default", true);
  const { error } = await hotel.from("rate_plans").update({ is_default: true }).eq("tenant_id", ctx.tenantId).eq("id", planId);
  if (error) return fail("The default plan couldn't be changed.");
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "rate_plan_default_changed", entityType: "rate_plan", entityId: planId, after: { code: plan.code } });
  return { ok: true, value: true };
}

export async function deletePlan(db: SupabaseClient, ctx: { tenantId: string; userId: string }, planId: string): Promise<Result<true>> {
  const hotel = db.schema("hotel");
  const { data: plan } = await hotel.from("rate_plans").select("*").eq("tenant_id", ctx.tenantId).eq("id", planId).maybeSingle();
  if (!plan) return fail("That plan wasn't found.");
  if (plan.is_default) return fail("The default plan can't be deleted.");
  const [{ count: children }, { count: bookings }] = await Promise.all([
    hotel.from("rate_plans").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("parent_plan_id", planId),
    hotel.from("reservations").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("rate_plan_id", planId),
  ]);
  if ((children ?? 0) > 0) return fail("Other plans follow this one. Change or delete them first.");
  if ((bookings ?? 0) > 0) return fail("Bookings were made on this plan. Switch it off instead of deleting it.");
  const { error } = await hotel.from("rate_plans").delete().eq("tenant_id", ctx.tenantId).eq("id", planId);
  if (error) return fail("The plan couldn't be deleted.");
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "rate_plan_deleted", entityType: "rate_plan", entityId: planId, before: planFromRow(plan) });
  return { ok: true, value: true };
}

/* ---------- Price rules ---------- */

export const PriceInput = z.object({
  id: z.string().uuid().optional(),
  ratePlanId: z.string().uuid(),
  roomTypeCode: z.string().min(1).max(80).nullable().optional(),
  dateFrom: day,
  dateTo: day,
  daysOfWeek: dow,
  price: z.coerce.number().min(0).max(1_000_000_000),
  priority: z.coerce.number().int().min(0).max(100).default(0),
  label: z.string().trim().max(60).nullable().optional(),
});

async function planBelongs(db: SupabaseClient, tenantId: string, planId: string) {
  const { data } = await db.schema("hotel").from("rate_plans").select("id,parent_plan_id").eq("tenant_id", tenantId).eq("id", planId).maybeSingle();
  return data;
}

export async function savePriceRule(
  db: SupabaseClient,
  ctx: { tenantId: string; userId: string; roomTypeIds: string[] },
  input: z.infer<typeof PriceInput>,
  source: "manual" | "suggestion" = "manual",
): Promise<Result<PriceRule>> {
  if (input.dateFrom > input.dateTo) return fail("The last day is before the first day.");
  if (input.roomTypeCode && !ctx.roomTypeIds.includes(input.roomTypeCode)) return fail("That room type wasn't found.");
  if (!(await planBelongs(db, ctx.tenantId, input.ratePlanId))) return fail("That plan wasn't found.");
  const hotel = db.schema("hotel");
  let before: PriceRule | null = null;
  if (input.id) {
    const { data } = await hotel.from("rate_prices").select("*").eq("tenant_id", ctx.tenantId).eq("id", input.id).maybeSingle();
    if (!data) return fail("That price rule wasn't found.");
    before = priceFromRow(data);
  }
  const row = {
    tenant_id: ctx.tenantId,
    rate_plan_id: input.ratePlanId,
    room_type_code: input.roomTypeCode || null,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    days_of_week: input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7 ? input.daysOfWeek : null,
    price: input.price,
    priority: input.priority,
    label: input.label?.trim() || null,
    source,
  };
  const query = before
    ? hotel.from("rate_prices").update(row).eq("tenant_id", ctx.tenantId).eq("id", before.id)
    : hotel.from("rate_prices").insert({ ...row, created_by: ctx.userId });
  const { data, error } = await query.select("*").single();
  if (error || !data) return fail("The price couldn't be saved.");
  const saved = priceFromRow(data);
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: before ? "rate_price_updated" : "rate_price_created",
    entityType: "rate_price",
    entityId: saved.id,
    before,
    after: saved,
  });
  return { ok: true, value: saved };
}

export async function deletePriceRule(db: SupabaseClient, ctx: { tenantId: string; userId: string }, id: string): Promise<Result<true>> {
  const hotel = db.schema("hotel");
  const { data } = await hotel.from("rate_prices").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!data) return fail("That price rule wasn't found.");
  const { error } = await hotel.from("rate_prices").delete().eq("tenant_id", ctx.tenantId).eq("id", id);
  if (error) return fail("The price couldn't be removed.");
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "rate_price_deleted", entityType: "rate_price", entityId: id, before: priceFromRow(data) });
  return { ok: true, value: true };
}

/* ---------- Restrictions ---------- */

export const RestrictionInput = z.object({
  id: z.string().uuid().optional(),
  ratePlanId: z.string().uuid().nullable().optional(),
  roomTypeCode: z.string().min(1).max(80).nullable().optional(),
  dateFrom: day,
  dateTo: day,
  daysOfWeek: dow,
  minStay: z.coerce.number().int().min(1).max(365).nullable().optional(),
  maxStay: z.coerce.number().int().min(1).max(365).nullable().optional(),
  closed: z.boolean().default(false),
  closedToArrival: z.boolean().default(false),
  closedToDeparture: z.boolean().default(false),
  minAdvanceDays: z.coerce.number().int().min(0).max(730).nullable().optional(),
  maxAdvanceDays: z.coerce.number().int().min(0).max(730).nullable().optional(),
  note: z.string().trim().max(200).nullable().optional(),
});

export async function saveRestriction(
  db: SupabaseClient,
  ctx: { tenantId: string; userId: string; roomTypeIds: string[] },
  input: z.infer<typeof RestrictionInput>,
): Promise<Result<Restriction>> {
  if (input.dateFrom > input.dateTo) return fail("The last day is before the first day.");
  if (input.roomTypeCode && !ctx.roomTypeIds.includes(input.roomTypeCode)) return fail("That room type wasn't found.");
  if (input.ratePlanId && !(await planBelongs(db, ctx.tenantId, input.ratePlanId))) return fail("That plan wasn't found.");
  if (input.minStay && input.maxStay && input.minStay > input.maxStay) return fail("The minimum stay is longer than the maximum.");
  if (input.minAdvanceDays != null && input.maxAdvanceDays != null && input.minAdvanceDays > input.maxAdvanceDays) {
    return fail("The earliest booking is later than the latest.");
  }
  const nothing =
    !input.minStay && !input.maxStay && !input.closed && !input.closedToArrival && !input.closedToDeparture && input.minAdvanceDays == null && input.maxAdvanceDays == null;
  if (nothing) return fail("Choose at least one restriction.");

  const hotel = db.schema("hotel");
  let before: Restriction | null = null;
  if (input.id) {
    const { data } = await hotel.from("rate_restrictions").select("*").eq("tenant_id", ctx.tenantId).eq("id", input.id).maybeSingle();
    if (!data) return fail("That restriction wasn't found.");
    before = restrictionFromRow(data);
  }
  const row = {
    tenant_id: ctx.tenantId,
    rate_plan_id: input.ratePlanId || null,
    room_type_code: input.roomTypeCode || null,
    date_from: input.dateFrom,
    date_to: input.dateTo,
    days_of_week: input.daysOfWeek && input.daysOfWeek.length > 0 && input.daysOfWeek.length < 7 ? input.daysOfWeek : null,
    min_stay: input.minStay ?? null,
    max_stay: input.maxStay ?? null,
    closed: input.closed,
    closed_to_arrival: input.closedToArrival,
    closed_to_departure: input.closedToDeparture,
    min_advance_days: input.minAdvanceDays ?? null,
    max_advance_days: input.maxAdvanceDays ?? null,
    note: input.note?.trim() || null,
  };
  const query = before
    ? hotel.from("rate_restrictions").update(row).eq("tenant_id", ctx.tenantId).eq("id", before.id)
    : hotel.from("rate_restrictions").insert({ ...row, created_by: ctx.userId });
  const { data, error } = await query.select("*").single();
  if (error || !data) return fail("The restriction couldn't be saved.");
  const saved = restrictionFromRow(data);
  await writeAuditLog({
    tenantId: ctx.tenantId,
    actorUserId: ctx.userId,
    action: before ? "rate_restriction_updated" : "rate_restriction_created",
    entityType: "rate_restriction",
    entityId: saved.id,
    before,
    after: saved,
  });
  return { ok: true, value: saved };
}

export async function deleteRestriction(db: SupabaseClient, ctx: { tenantId: string; userId: string }, id: string): Promise<Result<true>> {
  const hotel = db.schema("hotel");
  const { data } = await hotel.from("rate_restrictions").select("*").eq("tenant_id", ctx.tenantId).eq("id", id).maybeSingle();
  if (!data) return fail("That restriction wasn't found.");
  const { error } = await hotel.from("rate_restrictions").delete().eq("tenant_id", ctx.tenantId).eq("id", id);
  if (error) return fail("The restriction couldn't be removed.");
  await writeAuditLog({ tenantId: ctx.tenantId, actorUserId: ctx.userId, action: "rate_restriction_deleted", entityType: "rate_restriction", entityId: id, before: restrictionFromRow(data) });
  return { ok: true, value: true };
}
