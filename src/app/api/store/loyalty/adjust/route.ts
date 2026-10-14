import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { adjustSchema } from "@/lib/store/loyalty";
import { adjustLoyaltyPoints } from "@/lib/store/loyalty-server";

/** POST /api/store/loyalty/adjust { slug, email, points, note } — add or remove points for a customer, with a reason. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change points." }, { status: 403 });
  const parsed = adjustSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  try {
    const result = await adjustLoyaltyPoints(resolved.access.tenantId, parsed.data, resolved.access.userId);
    if ("error" in result) {
      return NextResponse.json(
        { error: result.error === "NO_ACCOUNT" ? "No customer account uses that email address yet. Points go on a customer's account, which is made when they order or sign up." : `That would take them below zero. They have ${result.balance} points.` },
        { status: 409 },
      );
    }
    await logActivity({
      tenantId: resolved.access.tenantId,
      actor: resolved.access,
      area: "loyalty",
      action: parsed.data.points > 0 ? "added" : "removed",
      targetLabel: `${Math.abs(parsed.data.points)} points for ${parsed.data.email}`,
    });
    return NextResponse.json({ balance: result.balance });
  } catch (error) {
    console.error("[loyalty] adjust failed", error);
    return NextResponse.json({ error: "We couldn't change the points just now. Please try again." }, { status: 500 });
  }
}
