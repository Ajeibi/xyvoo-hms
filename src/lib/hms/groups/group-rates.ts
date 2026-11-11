import { logGroupAction, type GroupAccessContext } from "./group-access";
import { validateRateTemplate, type GroupRateInput, type GroupRateTemplate, type GroupRatesView, type HotelPlanView } from "./group-rates-shared";

/*
 * Group rate templates. The group defines a plan once; pushing it gives each chosen hotel an ordinary
 * rate plan derived from that hotel's own default plan, marked as set by the group. Prices are still
 * worked out by each hotel's priceStay, so nothing else changes. The database keeps hotels from
 * editing what the group set (trigger hotel.guard_group_rate_plan).
 */

export * from "./group-rates-shared";

function toTemplate(r: Record<string, unknown>): GroupRateTemplate {
  return {
    id: r.id as string,
    code: r.code as string,
    name: r.name as string,
    description: (r.description as string) ?? null,
    deriveKind: (r.derive_kind as "percent" | "amount") ?? "percent",
    deriveValue: Number(r.derive_value) || 0,
    boardBasis: (r.board_basis as string) || "Room only",
    refundable: Boolean(r.refundable),
    prepayRequired: Boolean(r.prepay_required),
    channels: (r.channels as string[]) ?? [],
    sellFrom: (r.sell_from as string) ?? null,
    sellTo: (r.sell_to as string) ?? null,
    active: Boolean(r.active),
    updatedAt: r.updated_at as string,
  };
}

/** Templates and every hotel's plans, read with the caller's token. */
export async function loadGroupRates(ctx: GroupAccessContext): Promise<GroupRatesView> {
  const db = ctx.userDb.schema("hotel");
  const { data: templates } = await db.from("hotel_group_rate_templates").select("*").eq("group_id", ctx.group.id).order("code");
  const plansByHotel: Record<string, HotelPlanView[]> = {};
  const unreadable: string[] = [];
  const { data: plans, error } = await db
    .from("rate_plans")
    .select("id, tenant_id, code, name, is_default, active, group_template_id, derive_kind, derive_value, refundable, sort_order")
    .in("tenant_id", ctx.hotels.map((h) => h.tenantId))
    .order("sort_order");
  if (error) {
    unreadable.push(...ctx.hotels.map((h) => h.name));
  } else {
    for (const p of (plans ?? []) as Array<Record<string, unknown>>) {
      (plansByHotel[p.tenant_id as string] ??= []).push({
        tenantId: p.tenant_id as string,
        planId: p.id as string,
        code: p.code as string,
        name: p.name as string,
        isDefault: Boolean(p.is_default),
        active: Boolean(p.active),
        groupTemplateId: (p.group_template_id as string) ?? null,
        deriveKind: (p.derive_kind as string) ?? null,
        deriveValue: Number(p.derive_value) || 0,
        refundable: Boolean(p.refundable),
      });
    }
  }
  return { templates: ((templates ?? []) as Array<Record<string, unknown>>).map(toTemplate), plansByHotel, unreadable };
}

export async function saveRateTemplate(ctx: GroupAccessContext, id: string | null, input: GroupRateInput) {
  const problem = validateRateTemplate(input);
  if (problem) throw new Error(problem);
  const row = {
    group_id: ctx.group.id,
    code: input.code.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || null,
    derive_kind: input.deriveKind,
    derive_value: input.deriveValue,
    board_basis: input.boardBasis.trim() || "Room only",
    refundable: input.refundable,
    prepay_required: input.prepayRequired,
    channels: input.channels,
    sell_from: input.sellFrom || null,
    sell_to: input.sellTo || null,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  const q = id
    ? ctx.service.schema("hotel").from("hotel_group_rate_templates").update(row).eq("id", id).eq("group_id", ctx.group.id).select("id").single()
    : ctx.service.schema("hotel").from("hotel_group_rate_templates").insert({ ...row, created_by: ctx.userId }).select("id").single();
  const { data, error } = await q;
  if (error) throw new Error(/duplicate|unique/i.test(error.message) ? "The group already has a plan with that code." : error.message);
  await logGroupAction(ctx.service, { groupId: ctx.group.id, actorUserId: ctx.userId, action: "rate_template_saved", detail: { code: row.code } });

  // Hotels that already have it get the change straight away.
  const { data: using } = await ctx.service.schema("hotel").from("rate_plans").select("tenant_id").eq("group_template_id", data.id);
  const results: Array<{ tenantId: string; ok: boolean; error: string | null }> = [];
  for (const u of using ?? []) results.push(await pushOne(ctx, data.id as string, u.tenant_id as string));
  return { id: data.id as string, updatedHotels: results };
}

async function pushOne(ctx: GroupAccessContext, templateId: string, tenantId: string) {
  const { error } = await ctx.service.schema("hotel").rpc("push_group_rate_template", { p_template: templateId, p_tenant: tenantId, p_actor: ctx.userId });
  return { tenantId, ok: !error, error: error?.message ?? null };
}

/** Sends a template to the chosen hotels. Each hotel succeeds or fails on its own. */
export async function pushRateTemplate(ctx: GroupAccessContext, templateId: string, tenantIds: string[]) {
  const allowed = new Set(ctx.hotels.map((h) => h.tenantId));
  const results = [];
  for (const id of tenantIds) {
    if (!allowed.has(id)) {
      results.push({ tenantId: id, ok: false, error: "Not in this group." });
      continue;
    }
    results.push(await pushOne(ctx, templateId, id));
  }
  return results;
}

export async function withdrawRateTemplate(ctx: GroupAccessContext, templateId: string, tenantId: string) {
  if (!ctx.hotels.some((h) => h.tenantId === tenantId)) throw new Error("That hotel isn't in this group.");
  const { data: tpl } = await ctx.service.schema("hotel").from("hotel_group_rate_templates").select("id").eq("id", templateId).eq("group_id", ctx.group.id).maybeSingle();
  if (!tpl) throw new Error("That plan isn't in this group.");
  const { error } = await ctx.service.schema("hotel").rpc("withdraw_group_rate_template", { p_template: templateId, p_tenant: tenantId, p_actor: ctx.userId });
  if (error) throw new Error(error.message);
}

/** Deletes a template; hotels keep their copies as their own plans (the database unmarks them). */
export async function deleteRateTemplate(ctx: GroupAccessContext, templateId: string) {
  const { error } = await ctx.service.schema("hotel").from("hotel_group_rate_templates").delete().eq("id", templateId).eq("group_id", ctx.group.id);
  if (error) throw new Error(error.message);
}
