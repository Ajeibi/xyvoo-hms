import { NextResponse } from "next/server";
import { checkCode, CODE_CHECK_MESSAGES } from "@/lib/auth/account-codes";
import { clientIp, rateLimitShared } from "@/lib/rate-limit";
import { getInviteByToken, recordCodeAttempt } from "./team";
import { hashInviteCode, inviteState, isWellFormedToken, type InviteRow } from "./team-rules";

/** Shared steps for the public "join a team" routes. */

export const INVITE_UNUSABLE = "This invitation isn't valid any more. Ask the shop to send you a new one.";

/** The open invite for a link token, or an error response that says the same thing for every failure. */
export async function openInviteForToken(token: unknown, req: Request): Promise<{ invite: InviteRow } | { error: NextResponse }> {
  if (!(await rateLimitShared(`store-join:${clientIp(req)}`, 30, 15 * 60_000)).ok) {
    return { error: NextResponse.json({ error: "Too many attempts. Please wait a few minutes and try again." }, { status: 429 }) };
  }
  const invite = isWellFormedToken(token) ? await getInviteByToken(token) : null;
  if (!invite || inviteState(invite) !== "open") return { error: NextResponse.json({ error: INVITE_UNUSABLE }, { status: 410 }) };
  return { invite };
}

/** Checks the six-digit code for the invite, counting the attempt. Null when it's right. */
export async function inviteCodeProblem(invite: InviteRow, code: unknown): Promise<NextResponse | null> {
  if (typeof code !== "string" || !/^\d{6}$/.test(code.trim())) {
    return NextResponse.json({ error: "Enter the 6-digit code from the email.", field: "code" }, { status: 400 });
  }
  const result = checkCode(
    invite.code_hash && invite.code_expires_at
      ? { code_hash: invite.code_hash, expires_at: invite.code_expires_at, attempts: invite.code_attempts ?? 0, consumed_at: null }
      : null,
    hashInviteCode(invite.id, code),
  );
  if (result === "ok") return null;
  if (result === "wrong") await recordCodeAttempt(invite);
  return NextResponse.json({ error: CODE_CHECK_MESSAGES[result], field: "code" }, { status: 400 });
}
