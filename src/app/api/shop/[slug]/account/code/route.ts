import { requestLanguage, saveShopperLanguage, shopperT } from "@/lib/store/i18n/shopper";
import { NextResponse } from "next/server";
import { z } from "zod";
import { findAccountByEmail, issueSignInCode, sendSignInCodeEmail } from "@/lib/store/customer-accounts";
import { issueMessage, resolveShopForAccount } from "@/lib/store/customer-api";

const BodySchema = z.object({ email: z.string().trim().toLowerCase().max(200).email("Enter an email address in the format name@example.com.") });

/**
 * POST /api/shop/<store>/account/code { email } — emails a sign-in code. The
 * answer is the same whether or not the email has an account, so nobody can use
 * it to find out who shops here.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "code", 10);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slug, shop.tenant.id);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issueMessage(t, parsed.error.issues[0], "errors.acCheckEmail") }, { status: 400 });

  try {
    const account = await findAccountByEmail(shop.tenant.id, parsed.data.email);
    if (account) {
      // The language they're using now: for this code and the account's later emails.
      await saveShopperLanguage("customer_accounts", shop.tenant.id, { id: account.id }, await requestLanguage(req, slug, shop.tenant.id));
      const code = await issueSignInCode(shop.tenant.id, account.id);
      if (code) await sendSignInCodeEmail(shop.tenant, account, code);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[account code] failed", error);
    return NextResponse.json({ error: t("errors.acCodeFailed") }, { status: 500 });
  }
}
