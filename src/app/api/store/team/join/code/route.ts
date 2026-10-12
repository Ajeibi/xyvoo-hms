import { NextResponse } from "next/server";
import { rateLimitShared } from "@/lib/rate-limit";
import { issueInviteCode, sendInviteCodeEmail, storeNameAndSlug } from "@/lib/store/team";
import { openInviteForToken } from "@/lib/store/team-join";
import { codeCooldownLeft } from "@/lib/store/team-rules";

/**
 * POST /api/store/team/join/code { token } — emails a six-digit code to the
 * invited address. The code always goes to the address the shop invited,
 * never one given here, so only that inbox's owner can join.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const found = await openInviteForToken(body?.token, req);
  if ("error" in found) return found.error;
  const { invite } = found;

  const wait = codeCooldownLeft(invite.code_sent_at);
  if (wait > 0) return NextResponse.json({ error: `We've just sent a code. You can ask for another in ${wait} seconds.` }, { status: 429 });
  if (!(await rateLimitShared(`store-join-code:${invite.id}`, 5, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "We've sent several codes already. Please check your inbox and spam folder, or try again in an hour." }, { status: 429 });
  }

  try {
    const code = await issueInviteCode(invite);
    const store = await storeNameAndSlug(invite.tenant_id);
    await sendInviteCodeEmail({ to: invite.email, name: invite.name, storeName: store?.storeName || "the shop", code });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[team join] code not sent", { inviteId: invite.id, error });
    return NextResponse.json({ error: "We couldn't send the code. Please try again." }, { status: 500 });
  }
}
