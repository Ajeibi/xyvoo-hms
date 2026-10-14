import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { logActivity } from "@/lib/store/activity";
import { DISCOUNT_COLUMNS, discountInputSchema, mapDiscountCode, toDiscountRow, type DiscountCodeRow } from "@/lib/store/discounts";
import { countDiscountUses, duplicateCode, noTargetsLeft, ownedTargets } from "@/lib/store/discounts-server";

/** GET /api/store/discounts?slug= — the shop's codes, newest first, with how many times each has been used. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const tenantId = resolved.access.tenantId;
  const { data, error } = await resolved.service.schema("store").from("discount_codes").select(DISCOUNT_COLUMNS).eq("tenant_id", tenantId).is("referral_account_id", null).order("created_at", { ascending: false });
  if (error) {
    console.error("[discounts] list failed", error);
    return NextResponse.json({ error: "We couldn't load your discount codes." }, { status: 500 });
  }
  const codes = ((data || []) as DiscountCodeRow[]).map(mapDiscountCode);
  const uses = await countDiscountUses(tenantId, codes.map((c) => c.id));
  return NextResponse.json({
    codes: codes.map((c) => ({ ...c, uses: uses.get(c.id) ?? 0 })),
    canManage: resolved.capabilities.canManagePricing,
  });
}

/** POST /api/store/discounts { slug, ...code } — creates a code. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManagePricing) return NextResponse.json({ error: "Only the owner or an admin can create discount codes." }, { status: 403 });

  const parsed = discountInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });

  const tenantId = resolved.access.tenantId;
  const input = await ownedTargets(resolved.service, tenantId, parsed.data);
  if (!input) return noTargetsLeft();
  const { data, error } = await resolved.service
    .schema("store")
    .from("discount_codes")
    .insert({ tenant_id: tenantId, ...toDiscountRow(input) })
    .select(DISCOUNT_COLUMNS)
    .single();
  if (error?.code === "23505") return duplicateCode();
  if (error || !data) {
    console.error("[discounts] create failed", error);
    return NextResponse.json({ error: "We couldn't save that code. Please try again." }, { status: 500 });
  }
  const created = mapDiscountCode(data as DiscountCodeRow);
  await logActivity({ tenantId, actor: resolved.access, area: "discounts", action: "created", targetId: created.id, targetLabel: created.code });
  return NextResponse.json({ code: { ...created, uses: 0 } }, { status: 201 });
}
