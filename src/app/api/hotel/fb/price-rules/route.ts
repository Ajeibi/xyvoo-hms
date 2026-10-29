import { NextResponse } from "next/server";
import { z } from "zod";
import { FB_PRICE_CHANGE_LIMITS, type FbPriceRule, isValidTimeZone, validatePriceRule } from "@/lib/hms/fb-price-rules";
import { createPriceRule, deletePriceRule, loadPriceRules, updatePriceRule } from "@/lib/hms/fb-pricing";
import { getTenantFbSettings, upsertTenantFbTimeZone } from "@/lib/hms/fb-settings";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const RuleSchema = z.object({
  name: z.string().max(60, "Keep the name to 60 characters."),
  outletId: z.string().uuid().nullable(),
  categoryIds: z.array(z.string().uuid()).max(100),
  days: z.array(z.number().int().min(0).max(6)).max(7),
  startsAt: z.string().regex(/^\d{2}:\d{2}$/, "Enter a start time."),
  endsAt: z.string().regex(/^\d{2}:\d{2}$/, "Enter an end time."),
  changePercent: z.coerce
    .number()
    .min(FB_PRICE_CHANGE_LIMITS.min, `A discount can be up to ${-FB_PRICE_CHANGE_LIMITS.min}% off.`)
    .max(FB_PRICE_CHANGE_LIMITS.max, `An increase can be up to ${FB_PRICE_CHANGE_LIMITS.max}%.`),
  isActive: z.boolean(),
});

const BodySchema = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("create"), rule: RuleSchema }),
  z.object({ slug: z.string().min(1), action: z.literal("update"), id: z.string().uuid(), rule: RuleSchema }),
  z.object({ slug: z.string().min(1), action: z.literal("delete"), id: z.string().uuid() }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("timeZone"),
    timeZone: z.string().min(1).max(64).refine(isValidTimeZone, "Choose a time zone from the list."),
  }),
]);

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const auth = await requireFbApi(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const [rules, settings] = await Promise.all([
    loadPriceRules(auth.service, auth.tenant.id),
    getTenantFbSettings(auth.service, auth.tenant.id),
  ]);
  return NextResponse.json({ rules, timeZone: settings.timeZone });
}

/** Creates, edits or deletes a price rule, or sets the hotel's time zone. Items already ordered keep their price. */
export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const audit = (action: string, entityId: string, before: FbPriceRule | null, after: FbPriceRule | null) =>
      writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action,
        entityType: "fb_price_rule",
        entityId,
        before,
        after,
      });

    if (body.action === "timeZone") {
      const before = await getTenantFbSettings(auth.service, auth.tenant.id);
      await upsertTenantFbTimeZone(auth.service, auth.tenant.id, body.timeZone);
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fb_time_zone_changed",
        entityType: "tenant_fb_settings",
        entityId: auth.tenant.id,
        before: { timeZone: before.timeZone },
        after: { timeZone: body.timeZone },
      });
      return NextResponse.json({ ok: true, timeZone: body.timeZone });
    }

    if (body.action === "delete") {
      const result = await deletePriceRule(auth.service, auth.tenant.id, body.id);
      if (result.error || !result.rule) return NextResponse.json({ error: result.error }, { status: 400 });
      await audit("fb_price_rule_deleted", body.id, result.rule, null);
      return NextResponse.json({ ok: true });
    }

    const invalid = validatePriceRule(body.rule);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    if (body.action === "create") {
      const result = await createPriceRule(auth.service, auth.tenant.id, body.rule);
      if (result.error || !result.rule) {
        return NextResponse.json({ error: result.error ?? "Could not save. Try again." }, { status: 400 });
      }
      await audit("fb_price_rule_created", result.rule.id, null, result.rule);
      return NextResponse.json({ ok: true, rule: result.rule });
    }

    const result = await updatePriceRule(auth.service, auth.tenant.id, body.id, body.rule);
    if (result.error || !result.rule) {
      return NextResponse.json({ error: result.error ?? "Could not save. Try again." }, { status: 400 });
    }
    await audit("fb_price_rule_changed", body.id, result.before, result.rule);
    return NextResponse.json({ ok: true, rule: result.rule });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 400 });
  }
}
