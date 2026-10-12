import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { FREE_RULE_COLUMNS, freeRuleSchema, mapFreeRule, toFreeRuleRow, type FreeDeliveryRuleRow } from "@/lib/store/free-delivery";

/** GET /api/store/delivery-free-rules?slug= — the shop's free delivery rules, in order. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { data, error } = await resolved.service
    .schema("store")
    .from("delivery_free_rules")
    .select(FREE_RULE_COLUMNS)
    .eq("tenant_id", resolved.access.tenantId)
    .order("sort_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rules: ((data || []) as FreeDeliveryRuleRow[]).map(mapFreeRule), canManage: resolved.capabilities.canManageSettings });
}

/** POST /api/store/delivery-free-rules { slug, ...rule } — adds a rule at the end. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change delivery." }, { status: 403 });

  const parsed = freeRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });

  const db = resolved.service.schema("store");
  const { count } = await db.from("delivery_free_rules").select("id", { count: "exact", head: true }).eq("tenant_id", resolved.access.tenantId);
  const { data, error } = await db
    .from("delivery_free_rules")
    .insert({ tenant_id: resolved.access.tenantId, sort_order: count ?? 0, ...toFreeRuleRow(parsed.data) })
    .select(FREE_RULE_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rule: mapFreeRule(data as FreeDeliveryRuleRow) }, { status: 201 });
}
