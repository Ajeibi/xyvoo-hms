import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_CHECK_MESSAGES, findAuthUserByEmail, redeemAccountCode } from "@/lib/auth/account-codes";
import { codeSchema, emailSchema, jsonError, limitCodeRequests } from "@/lib/auth/code-routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const Schema = z.object({ email: emailSchema, code: codeSchema });

/** Confirms an account's email address with the emailed code. The browser then signs in with the password. */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Enter the 6-digit code from the email.");
  const { email, code } = parsed.data;

  const limited = limitCodeRequests(req, "verify-confirm", email, { perIp: 20, perEmail: 10 });
  if (limited) return limited;

  const user = await findAuthUserByEmail(email);
  if (!user) return jsonError(CODE_CHECK_MESSAGES.missing);
  if (user.emailConfirmedAt) return NextResponse.json({ ok: true, alreadyConfirmed: true });

  const result = await redeemAccountCode(user.id, "verify_email", code);
  if (result !== "ok") return jsonError(CODE_CHECK_MESSAGES[result]);

  const { error } = await createServerSupabaseClient().auth.admin.updateUserById(user.id, { email_confirm: true });
  if (error) {
    console.error("[verify-email/confirm] confirm failed", error);
    return jsonError("We couldn't confirm your email just now. Please try again.", 500);
  }
  return NextResponse.json({ ok: true });
}
