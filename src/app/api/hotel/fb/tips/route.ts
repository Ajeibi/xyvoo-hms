import { NextResponse } from "next/server";
import { z } from "zod";
import { loadTipStaff, loadTipsModel, payTips } from "@/lib/hms/fb-tips";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const PayoutSchema = z.object({
  slug: z.string().min(1),
  source: z.enum(["own", "pool"]),
  payments: z
    .array(
      z.object({
        staffId: z.string().uuid(),
        amount: z.coerce.number().positive("Each amount must be more than zero.").max(100_000_000),
      }),
    )
    .min(1, "Choose who is being paid.")
    .max(50),
  method: z.enum(["cash", "bank"]),
  note: z.string().trim().max(200, "Keep the note to 200 characters.").optional().nullable(),
});

/** Tips owed and recent tips. Staff see only their own tips; managers see everyone's. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const auth = await requireFbApi(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const denied = fbForbidden(auth.capabilities, "canTakePayment");
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  // Just the names, for the "Tip for" picker when taking a payment.
  if (new URL(req.url).searchParams.get("list") === "staff") {
    return NextResponse.json({ staff: await loadTipStaff(auth.service, auth.tenant.id) });
  }

  const model = await loadTipsModel(auth.service, auth.tenant.id);
  if (auth.capabilities.canConfigure) return NextResponse.json({ ...model, canPayOut: true, userId: auth.user.id });
  const mine = (id: string | null) => id === auth.user.id;
  return NextResponse.json({
    staff: model.staff.filter((s) => mine(s.userId)),
    balances: model.balances.filter((b) => mine(b.staffId) || b.staffId === null),
    recentTips: model.recentTips.filter((t) => mine(t.staffId) || t.staffId === null),
    recentPayouts: model.recentPayouts.filter((p) => mine(p.staffId)),
    canPayOut: false,
    userId: auth.user.id,
  });
}

/** Records tips handed to staff (managers only). */
export async function POST(req: Request) {
  try {
    const body = PayoutSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const result = await payTips(auth.service, {
      tenantId: auth.tenant.id,
      source: body.source,
      payments: body.payments,
      method: body.method,
      note: body.note,
      paidBy: auth.user.id,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "fb_tips_paid_out",
      entityType: "fb_tip_payout",
      entityId: result.payoutIds[0] ?? auth.tenant.id,
      after: {
        source: body.source,
        method: body.method,
        total: result.total,
        payments: body.payments,
        payout_ids: result.payoutIds,
        note: body.note ?? null,
      },
    });
    return NextResponse.json({ ok: true, total: result.total });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 400 });
  }
}
