import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_CHECK_MESSAGES } from "@/lib/auth/account-codes";
import { findAccountByEmail, redeemSignInCode, startCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";

const BodySchema = z.object({
  email: z.string().trim().toLowerCase().max(200).email("Enter your email address."),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email."),
});

/** POST /api/shop/<store>/account/verify { email, code } — signs this device in, with the email confirmed. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "verify", 20);
  if (shop.error) return shop.error;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Enter the 6-digit code from the email." }, { status: 400 });

  try {
    const account = await findAccountByEmail(shop.tenant.id, parsed.data.email);
    const result = account ? await redeemSignInCode(account.id, parsed.data.code) : "missing";
    if (!account || result !== "ok") return NextResponse.json({ error: CODE_CHECK_MESSAGES[result === "ok" ? "missing" : result] }, { status: 400 });
    const cookie = await startCustomerSession(shop.tenant.id, account.id, true);
    const res = NextResponse.json({ ok: true, account: { name: account.name, email: account.email } });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch (error) {
    console.error("[account verify] failed", error);
    return NextResponse.json({ error: "We couldn't sign you in just now. Please try again." }, { status: 500 });
  }
}
