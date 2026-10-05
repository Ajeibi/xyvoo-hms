import { NextResponse } from "next/server";
import { z } from "zod";
import { CODE_CHECK_MESSAGES, findAuthUserByEmail, redeemAccountCode } from "@/lib/auth/account-codes";
import { codeSchema, emailSchema, jsonError, limitCodeRequests } from "@/lib/auth/code-routes";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const Schema = z.object({
  email: emailSchema,
  code: codeSchema,
  password: z.string().min(8, "Use at least 8 characters for your new password.").max(72, "Use 72 characters or fewer."),
});

/**
 * Sets a new password with the emailed reset code. Entering the code proves
 * access to the inbox, so an unconfirmed email is confirmed at the same time.
 */
export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError(parsed.error.issues[0]?.message || "Check the details and try again.");
  const { email, code, password } = parsed.data;

  const limited = limitCodeRequests(req, "reset-confirm", email, { perIp: 20, perEmail: 10 });
  if (limited) return limited;

  const user = await findAuthUserByEmail(email);
  if (!user) return jsonError(CODE_CHECK_MESSAGES.missing);

  const result = await redeemAccountCode(user.id, "reset_password", code);
  if (result !== "ok") return jsonError(CODE_CHECK_MESSAGES[result]);

  const { error } = await createServerSupabaseClient().auth.admin.updateUserById(user.id, {
    password,
    ...(user.emailConfirmedAt ? {} : { email_confirm: true }),
  });
  if (error) {
    console.error("[password-reset/confirm] update failed", error);
    const weak = /password/i.test(error.message);
    return jsonError(weak ? error.message : "We couldn't update your password just now. Please try again.", weak ? 400 : 500);
  }
  return NextResponse.json({ ok: true });
}
