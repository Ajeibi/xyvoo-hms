import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_TTL_MINUTES, findAuthUserByEmail, issueAccountCode, maskEmail } from "@/lib/auth/account-codes";
import { emailSchema, jsonError, limitCodeRequests } from "@/lib/auth/code-routes";
import { sendAccountCodeEmail } from "@/lib/mail/mailtrap";

const Schema = z.object({ email: emailSchema });

/**
 * Emails a code for confirming an account's email address. The reply is the
 * same whether or not the address has an unconfirmed account, so it can't be
 * used to find out who has signed up.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Enter a valid email address.");
  const { email } = parsed.data;

  const limited = limitCodeRequests(req, "verify-send", email, { perIp: 10, perEmail: 5 });
  if (limited) return limited;

  const sent = NextResponse.json({ ok: true, sentTo: maskEmail(email) });
  const user = await findAuthUserByEmail(email);
  if (!user || user.emailConfirmedAt) return sent;

  const code = await issueAccountCode(user.id, "verify_email");
  // A code went out under a minute ago: it's still valid, so don't send another.
  if (!code) return sent;

  try {
    await sendAccountCodeEmail({ to: user.email, name: user.fullName, code, purpose: "verify_email", expiresInMinutes: CODE_TTL_MINUTES });
  } catch (error) {
    console.error("[verify-email/send] email failed", error);
    return jsonError("We couldn't send the email just now. Please try again in a minute.", 502);
  }
  return sent;
}
