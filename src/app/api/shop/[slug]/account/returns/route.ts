import { NextResponse } from "next/server";
import { getCustomerSession } from "@/lib/store/customer-accounts";
import { issueMessage, resolveShopForAccount, shopperMessage } from "@/lib/store/customer-api";
import { shopperT } from "@/lib/store/i18n/shopper";
import type { Translator } from "@/lib/store/i18n/translate";
import { returnRequestSchema } from "@/lib/store/returns";
import { accountReturns, createReturnRequest, returnableOrder, ReturnError } from "@/lib/store/returns-server";

const failure = (t: Translator, error: unknown) => {
  if (error instanceof ReturnError) return NextResponse.json({ error: shopperMessage(t, error.message) }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
  console.error("[returns] failed", error);
  return NextResponse.json({ error: t("errors.acActionFailed") }, { status: 500 });
};

/**
 * GET /api/shop/<store>/account/returns — the shopper's returns so far.
 * GET /api/shop/<store>/account/returns?order=<id> — what of that order can still be returned.
 * Only on a device that confirmed the email with a code.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "returns", 60);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slug, shop.tenant.id);
  const session = await getCustomerSession(shop.tenant.id);
  if (!session?.verified) return NextResponse.json({ error: t("errors.acConfirmEmailFirst") }, { status: 401 });
  try {
    const orderId = new URL(req.url).searchParams.get("order");
    if (orderId) {
      try {
        return NextResponse.json({ order: await returnableOrder(shop.tenant.id, session.account, orderId) }, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        // Not delivered yet, or not theirs: nothing to offer, and no reason to alarm anyone.
        if (error instanceof ReturnError) return NextResponse.json({ order: null, message: shopperMessage(t, error.message) });
        throw error;
      }
    }
    return NextResponse.json({ returns: await accountReturns(shop.tenant.id, session.account) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return failure(t, error);
  }
}

/** POST /api/shop/<store>/account/returns { orderId, items, reason, note } — ask to return something. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "return-request", 10);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slug, shop.tenant.id);
  const session = await getCustomerSession(shop.tenant.id);
  if (!session?.verified) return NextResponse.json({ error: t("errors.acConfirmEmailFirst") }, { status: 401 });
  const parsed = returnRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issueMessage(t, parsed.error.issues[0], "errors.acCheckReturn") }, { status: 400 });
  try {
    const id = await createReturnRequest(shop.tenant.id, session.account, parsed.data);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return failure(t, error);
  }
}
