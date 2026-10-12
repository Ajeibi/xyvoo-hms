import { NextResponse } from "next/server";
import { z } from "zod";
import { findAuthUserByEmail } from "@/lib/auth/account-codes";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/store/activity";
import { acceptInvite, storeNameAndSlug } from "@/lib/store/team";
import { INVITE_UNUSABLE, inviteCodeProblem, openInviteForToken } from "@/lib/store/team-join";
import { passwordSchema } from "@/lib/store/team-rules";

const Schema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(100, "Keep your name to 100 characters."),
  password: passwordSchema,
});

/**
 * POST /api/store/team/join/signup { token, code, name, password } — for an
 * invited person without a XYVOO account. The account is created for the
 * invited address only, and only once the code emailed there is right, so the
 * email is already confirmed. The browser then signs in with the password.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const found = await openInviteForToken(body?.token, req);
  if ("error" in found) return found.error;
  const { invite } = found;

  const parsed = Schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Check your details.", field: issue?.path[0] }, { status: 400 });
  }

  if (await findAuthUserByEmail(invite.email).catch(() => null)) {
    return NextResponse.json({ error: "There's already a XYVOO account for this email address. Sign in instead.", field: "existing" }, { status: 409 });
  }

  const problem = await inviteCodeProblem(invite, body?.code);
  if (problem) return problem;

  try {
    const { data, error } = await createServerSupabaseClient().auth.admin.createUser({
      email: invite.email,
      password: parsed.data.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.data.name },
    });
    if (error || !data.user) {
      console.error("[team join] account not created", { inviteId: invite.id, error: error?.message });
      return NextResponse.json({ error: "We couldn't create your account. Please try again, or choose a different password." }, { status: 400 });
    }

    const result = await acceptInvite(invite.id, data.user.id);
    if (result === "invalid") return NextResponse.json({ error: INVITE_UNUSABLE }, { status: 410 });
    await logActivity({ tenantId: invite.tenant_id, actor: { userId: data.user.id, name: parsed.data.name }, area: "staff", action: "joined", targetId: data.user.id, targetLabel: parsed.data.name });
    const store = await storeNameAndSlug(invite.tenant_id);
    return NextResponse.json({ ok: true, email: invite.email, redirectTo: store ? `/storefront/${store.slug}/dashboard` : "/auth/login/storefront" });
  } catch (error) {
    console.error("[team join] signup failed", { inviteId: invite.id, error });
    return NextResponse.json({ error: "We couldn't create your account. Please try again." }, { status: 500 });
  }
}
