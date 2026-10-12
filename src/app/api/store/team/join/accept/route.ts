import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { logActivity } from "@/lib/store/activity";
import { acceptInvite, storeNameAndSlug } from "@/lib/store/team";
import { INVITE_UNUSABLE, inviteCodeProblem, openInviteForToken } from "@/lib/store/team-join";

/**
 * POST /api/store/team/join/accept { token, code } — for someone already
 * signed in. Their account's email must be the invited address, and the
 * code (emailed to that address) must match.
 */
export async function POST(req: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in first." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const found = await openInviteForToken(body?.token, req);
  if ("error" in found) return found.error;
  const { invite } = found;

  if ((user.email || "").trim().toLowerCase() !== invite.email) {
    return NextResponse.json({ error: `This invitation is for ${invite.email}. Sign in with that email address to accept it.` }, { status: 403 });
  }

  const problem = await inviteCodeProblem(invite, body?.code);
  if (problem) return problem;

  try {
    const result = await acceptInvite(invite.id, user.id);
    if (result === "invalid") return NextResponse.json({ error: INVITE_UNUSABLE }, { status: 410 });
    const store = await storeNameAndSlug(invite.tenant_id);
    if (result === "ok") {
      const name = typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim() ? user.user_metadata.full_name : invite.name;
      await logActivity({ tenantId: invite.tenant_id, actor: { userId: user.id, name }, area: "staff", action: "joined", targetId: user.id, targetLabel: name });
    }
    return NextResponse.json({ ok: true, redirectTo: store ? `/storefront/${store.slug}/dashboard` : "/auth/login/storefront" });
  } catch (error) {
    console.error("[team join] accept failed", { inviteId: invite.id, error });
    return NextResponse.json({ error: "We couldn't add you to the team. Please try again." }, { status: 500 });
  }
}
