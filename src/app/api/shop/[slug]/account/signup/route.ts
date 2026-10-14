import { NextResponse } from "next/server";
import { z } from "zod";
import { accountDetailsSchema, createAccount, findAccountByEmail, issueSignInCode, sendSignInCodeEmail, startCustomerSession } from "@/lib/store/customer-accounts";
import { resolveShopForAccount } from "@/lib/store/customer-api";

const BodySchema = accountDetailsSchema.extend({ source: z.enum(["prompt", "account_page"]).default("prompt") });

/**
 * POST /api/shop/<store>/account/signup { name, email, phone?, consent, source }
 * Creates the account and signs this device in straight away. If the email
 * already has an account here, nothing is changed: we email a sign-in code and
 * answer { needsCode: true } so the page can ask for it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const shop = await resolveShopForAccount(req, (await params).slug, "signup", 10);
  if (shop.error) return shop.error;
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check your details." }, { status: 400 });

  try {
    const { source, ...details } = parsed.data;
    const account = await createAccount(shop.tenant.id, details, source);
    if (!account) {
      const existing = await findAccountByEmail(shop.tenant.id, details.email);
      if (existing) {
        const code = await issueSignInCode(shop.tenant.id, existing.id);
        if (code) await sendSignInCodeEmail(shop.tenant, existing, code);
      }
      return NextResponse.json({ needsCode: true, email: details.email });
    }
    const cookie = await startCustomerSession(shop.tenant.id, account.id, false);
    const res = NextResponse.json({ ok: true, account: { name: account.name, email: account.email } });
    res.cookies.set(cookie.name, cookie.value, cookie.options);
    return res;
  } catch (error) {
    console.error("[account signup] failed", error);
    return NextResponse.json({ error: "We couldn't create your account just now. Please try again." }, { status: 500 });
  }
}
