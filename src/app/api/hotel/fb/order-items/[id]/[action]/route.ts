import { NextResponse } from "next/server";
import { z } from "zod";
import { compOrderItem, voidOrderItem } from "@/lib/hms/fb-orders";
import { checkReason, compNeeds, FB_REASON_MAX, voidNeeds } from "@/lib/hms/fb-void-rules";
import { verifyManagerPin } from "@/lib/hms/folio";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../../../_lib";

const Schema = z.object({
  slug: z.string().min(1),
  reason: z.string().max(FB_REASON_MAX).optional().nullable(),
  /** Not needed when the person is a manager or owner. */
  managerPin: z.string().max(20).optional(),
});

/** POST /order-items/[id]/void or /comp: take a line off the bill, or give it free. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await params;
    if (action !== "void" && action !== "comp") {
      return NextResponse.json({ error: "Unknown action." }, { status: 404 });
    }
    const body = Schema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, "canVoidOrder");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const { data: item } = await auth.service
      .schema("hotel")
      .from("fb_order_items")
      .select("id,order_id,name_snapshot,price_snapshot,quantity,kitchen_status,fired_at,comped_at")
      .eq("id", id)
      .eq("tenant_id", auth.tenant.id)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    const line = {
      kitchen_status: item.kitchen_status as string,
      fired_at: (item.fired_at as string) ?? null,
      price_snapshot: Number(item.price_snapshot),
      comped_at: (item.comped_at as string) ?? null,
    };
    const needs = action === "void" ? voidNeeds(line) : compNeeds(line);
    if (!needs.allowed) return NextResponse.json({ error: needs.error }, { status: 400 });

    const reason = checkReason(body.reason, needs.needsReason);
    if (reason.error) return NextResponse.json({ error: reason.error }, { status: 400 });
    if (needs.needsManager && !(await verifyManagerPin(auth.service, auth.tenant.id, body.managerPin, auth.role))) {
      return NextResponse.json(
        { error: body.managerPin ? "That manager PIN isn't right." : "A manager needs to approve this. Enter the manager PIN." },
        { status: 403 },
      );
    }

    const result =
      action === "void"
        ? await voidOrderItem(auth.service, auth.tenant.id, id, { reason: reason.reason, by: auth.user.id })
        : await compOrderItem(auth.service, auth.tenant.id, id, { reason: reason.reason as string, by: auth.user.id });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: action === "void" ? "fb_item_voided" : "fb_item_comped",
      entityType: "fb_order_item",
      entityId: id,
      before: { name: item.name_snapshot, price: Number(item.price_snapshot), status: item.kitchen_status },
      after: {
        order_id: item.order_id,
        reason: reason.reason,
        manager_approved: needs.needsManager,
        kitchen_had_started: needs.needsManager && action === "void",
      },
    });
    return NextResponse.json({ ok: true, item: result.item });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
