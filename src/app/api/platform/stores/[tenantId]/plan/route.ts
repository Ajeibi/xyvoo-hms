import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { PLAN_FEE_RATES } from "@/lib/store/site/onboarding";

const Schema = z.discriminatedUnion("plan", [
  z.object({ plan: z.literal("free") }),
  // Agreed Enterprise rate as a percentage, e.g. 1.5 for 1.5%.
  z.object({ plan: z.literal("enterprise"), feePercent: z.number().min(0).max(10) }),
]);

/**
 * PATCH /api/platform/stores/<tenantId>/plan — platform admins only. Puts a
 * store on an Enterprise rate agreed by sales, or back on Free. Standard is
 * bought by the merchant through Paystack, never set here.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  const auth = await requirePlatformAdmin();
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid plan." }, { status: 400 });

  const { tenantId } = await params;
  const { data: tenant } = await auth.service.from("tenants").select("id, product").eq("id", tenantId).maybeSingle();
  if (!tenant || tenant.product !== "store") return NextResponse.json({ error: "Store not found." }, { status: 404 });

  const update =
    parsed.data.plan === "enterprise"
      ? { plan: "enterprise", status: "active", platform_fee_rate: Math.round(parsed.data.feePercent * 100) / 10_000 }
      : { plan: "free", status: "active", platform_fee_rate: PLAN_FEE_RATES.free };

  const { error } = await auth.service.schema("store").from("subscriptions").update(update).eq("tenant_id", tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, ...update });
}
