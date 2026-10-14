import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";
import { returnRequestSchema } from "@/lib/store/returns";
import { accountReturns, createReturnRequest, returnableOrder, ReturnError } from "@/lib/store/returns-server";

const failure = (error: unknown) => {
  if (error instanceof ReturnError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
  console.error("[returns] failed", error);
  return NextResponse.json({ error: "We couldn't do that just now. Please try again." }, { status: 500 });
};

/**
 * GET /api/shop/<store>/account/returns — the shopper's returns so far.
 * GET /api/shop/<store>/account/returns?order=<id> — what of that order can still be returned.
 * Only on a device that confirmed the email with a code.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "returns", 60);
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  if (!session?.verified) return NextResponse.json({ error: "Please confirm your email with the code we send you first." }, { status: 401 });
  try {
    const orderId = new URL(req.url).searchParams.get("order");
    if (orderId) {
      try {
        return NextResponse.json({ order: await returnableOrder(shop.tenant.id, session.account, orderId) }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        // Not delivered yet, or not theirs: nothing to offer, and no reason to alarm anyone.
        if (error instanceof ReturnError) return NextResponse.json({ order: null, message: error.message });
        throw error;
      }
    }
    return NextResponse.json({ returns: await accountReturns(shop.tenant.id, session.account) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

/** POST /api/shop/<store>/account/returns { orderId, items, reason, note } — ask to return something. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "return-request", 10);
  if (shop.error) return shop.error;
  const session = await getCustomerSession(shop.tenant.id);
  if (!session?.verified) return NextResponse.json({ error: "Please confirm your email with the code we send you first." }, { status: 401 });
  const parsed = returnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your return." }, { status: 400 });
  try {
    const id = await createReturnRequest(shop.tenant.id, session.account, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
