import { NextResponse } from "next/server";
import { z } from "zod";
import type { CodeCheck } from "@/lib/auth/account-codes";
import { findAccountByEmail, redeemSignInCode, startCustomerSession } from "@/lib/store/customer-accounts";
import { issueMessage, resolveShopForAccount } from "@/lib/store/customer-api";
import type { MessageKey } from "@/lib/store/i18n/messages";
import { shopperT } from "@/lib/store/i18n/shopper";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().max(200).email("Enter your email address."),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

/** Why a code didn't work, in the shopper's words (in English, the same as CODE_CHECK_MESSAGES). */
const CODE_CHECK_WORDS: Record<Exclude<CodeCheck, "ok">, MessageKey> = {
  missing: "errors.acCodeMissing",
  expired: "errors.acCodeExpired",
  too_many_attempts: "errors.acCodeTooManyAttempts",
  wrong: "errors.acCodeWrong",
};

/** POST /api/shop/<store>/account/verify { email, code } — signs this device in, with the email confirmed. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const shop = await resolveShopForAccount(req, slug, "verify", 20);
  if (shop.error) return shop.error;
  const t = await shopperT(req, slug, shop.tenant.id);
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: issueMessage(t, parsed.error.issues[0], "errors.acEnterCode") }, { status: 400 });

  try {
    const account = await findAccountByEmail(shop.tenant.id, parsed.data.email);
    const result = account ? await redeemSignInCode(account.id, parsed.data.code) : "missing";
    if (!account || result !== "ok") return NextResponse.json({ error: t(CODE_CHECK_WORDS[result === "ok" ? "missing" : result]) }, { status: 400 });
    const cookie = await startCustomerSession(shop.tenant.id, account.id, true);
    const res = NextResponse.json({ ok: true, account: { name: account.name, email: account.email } });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch (error) {
    console.error("[account verify] failed", error);
    return NextResponse.json({ error: t("errors.acSignInFailed") }, { status: 500 });
  }
}
