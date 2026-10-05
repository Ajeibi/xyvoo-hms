import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_TTL_MINUTES, findAuthUserByEmail, issueAccountCode, maskEmail } from "@/lib/auth/account-codes";
import { emailSchema, jsonError, limitCodeRequests } from "@/lib/auth/code-routes";
import { sendAccountCodeEmail } from "@/lib/mail/mailtrap";

const Schema = z.object({ email: emailSchema });

/**
 * Emails a password-reset code, for any XYVOO account (HMS or Storefront). The
 * reply is identical whether or not an account exists for the address.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Enter a valid email address.");
  const { email } = parsed.data;

  const limited = limitCodeRequests(req, "reset-request", email, { perIp: 10, perEmail: 5 });
  if (limited) return limited;

  const reply = NextResponse.json({ ok: true, sentTo: maskEmail(email) });
  const user = await findAuthUserByEmail(email);
  if (!user) return reply;

  const code = await issueAccountCode(user.id, "reset_password");
  if (!code) return reply;

  try {
    await sendAccountCodeEmail({ to: user.email, name: user.fullName, code, purpose: "reset_password", expiresInMinutes: CODE_TTL_MINUTES });
  } catch (error) {
    // Logged only: failing loudly here would tell the caller the account exists.
    console.error("[password-reset/request] email failed", error);
  }
  return reply;
}
