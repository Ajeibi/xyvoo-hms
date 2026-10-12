import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { FREE_RULE_COLUMNS, freeRuleSchema, mapFreeRule, toFreeRuleRow, type FreeDeliveryRuleRow } from "@/lib/store/free-delivery";

async function authorise(slug: unknown) {
  const resolved = await resolveStoreRequest(typeof slug === "string" ? slug : "");
  if (resolved.error) return resolved;
  if (!resolved.capabilities.canManageSettings) {
    return { error: NextResponse.json({ error: "Only the owner or an admin can change delivery." }, { status: 403 }) };
  }
  return resolved;
}

/** PATCH /api/store/delivery-free-rules/<id> { slug, ...rule } or { slug, move: "up" | "down" } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await authorise(body?.slug);
  if (resolved.error) return resolved.error;
  const id = (await params).id;
  const db = resolved.service.schema("store");

  // Rules are checked in order, so the shop can move one up or down.
  if (body?.move === "up" || body?.move === "down") {
    const { data: rows } = await db.from("delivery_free_rules").select("id").eq("tenant_id", resolved.access.tenantId).order("sort_order").order("created_at");
    const ids = (rows || []).map((r) => r.id as string);
    const at = ids.indexOf(id);
    const to = body.move === "up" ? at - 1 : at + 1;
    if (at < 0) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
    if (to >= 0 && to < ids.length) {
      [ids[at], ids[to]] = [ids[to], ids[at]];
      await Promise.all(ids.map((rid, i) => db.from("delivery_free_rules").update({ sort_order: i }).eq("id", rid).eq("tenant_id", resolved.access.tenantId)));
    }
    return NextResponse.json({ ok: true });
  }

  const parsed = freeRuleSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  const { data, error } = await db
    .from("delivery_free_rules")
    .update(toFreeRuleRow(parsed.data))
    .eq("id", id)
    .eq("tenant_id", resolved.access.tenantId)
    .select(FREE_RULE_COLUMNS)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Rule not found." }, { status: 404 });
  return NextResponse.json({ rule: mapFreeRule(data as FreeDeliveryRuleRow) });
}

/** DELETE /api/store/delivery-free-rules/<id>?slug= */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await authorise(new URL(req.url).searchParams.get("slug"));
  if (resolved.error) return resolved.error;
  const { error } = await resolved.service.schema("store").from("delivery_free_rules").delete().eq("id", (await params).id).eq("tenant_id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
