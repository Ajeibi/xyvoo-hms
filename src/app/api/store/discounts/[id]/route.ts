import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { diffFields, logActivity, readBefore } from "@/lib/store/activity";
import { DISCOUNT_COLUMNS, discountInputSchema, mapDiscountCode, toDiscountRow, type DiscountCodeRow } from "@/lib/store/discounts";
import { countDiscountUses, duplicateCode, noTargetsLeft, ownedTargets } from "@/lib/store/discounts-server";

const notFound = () => NextResponse.json({ error: "That code no longer exists." }, { status: 404 });

/** PATCH /api/store/discounts/<id> { slug, ...code } — edits a code, or with only { slug, isActive } pauses or resumes it. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManagePricing) return NextResponse.json({ error: "Only the owner or an admin can change discount codes." }, { status: 403 });
  const tenantId = resolved.access.tenantId;
  const db = resolved.service.schema("store");

  let update: Record<string, unknown>;
  if (body && typeof body.isActive === "boolean" && body.code === undefined) {
    update = { is_active: body.isActive };
  } else {
    const parsed = discountInputSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });
    const input = await ownedTargets(resolved.service, tenantId, parsed.data);
    if (!input) return noTargetsLeft();
    update = toDiscountRow(input);
  }

  const before = await readBefore("discount_codes", tenantId, id, [...new Set(["code", ...Object.keys(update)])]);
  const { data, error } = await db.from("discount_codes").update(update).eq("id", id).eq("tenant_id", tenantId).select(DISCOUNT_COLUMNS).maybeSingle();
  if (error?.code === "23505") return duplicateCode();
  if (error) {
    console.error("[discounts] update failed", error);
    return NextResponse.json({ error: "We couldn't save that code. Please try again." }, { status: 500 });
  }
  if (!data) return notFound();
  const pausing = Object.keys(update).length === 1 && "is_active" in update;
  await logActivity({
    tenantId,
    actor: resolved.access,
    area: "discounts",
    action: pausing ? (update.is_active ? "resumed" : "paused") : "updated",
    targetId: id,
    targetLabel: String((data as DiscountCodeRow).code ?? before?.code ?? ""),
    changes: pausing ? undefined : diffFields(before, update),
  });
  const uses = await countDiscountUses(tenantId, [id]);
  return NextResponse.json({ code: { ...mapDiscountCode(data as DiscountCodeRow), uses: uses.get(id) ?? 0 } });
}

/** DELETE /api/store/discounts/<id>?slug= — removes a code. Past orders keep the code they used. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManagePricing) return NextResponse.json({ error: "Only the owner or an admin can delete discount codes." }, { status: 403 });
  const { data, error } = await resolved.service
    .schema("store")
    .from("discount_codes")
    .delete()
    .eq("id", id)
    .eq("tenant_id", resolved.access.tenantId)
    .select("id, code");
  if (error) {
    console.error("[discounts] delete failed", error);
    return NextResponse.json({ error: "We couldn't delete that code. Please try again." }, { status: 500 });
  }
  if (!data?.length) return notFound();
  await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "discounts", action: "deleted", targetId: id, targetLabel: data[0].code });
  return NextResponse.json({ success: true });
}
