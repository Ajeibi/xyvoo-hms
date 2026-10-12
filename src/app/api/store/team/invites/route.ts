import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { logActivity } from "@/lib/store/activity";
import { featureUnavailable } from "@/lib/store/features";
import { rateLimitShared } from "@/lib/rate-limit";
import { createOrRefreshInvite, listTeamMembers, sendInviteEmail, storeNameAndSlug } from "@/lib/store/team";
import { inviteSchema } from "@/lib/store/team-rules";

/** POST /api/store/team/invites { slug, name, email, role } — invite someone as Admin or Staff (Standard plan). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageTeam) return NextResponse.json({ error: "Only the owner or an admin can invite people." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "staff");
  if (blocked) return blocked;

  const parsed = inviteSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Check the details.", field: issue?.path[0] }, { status: 400 });
  }
  const { name, email, role } = parsed.data;

  // Each invite sends an email, so a store can't send unlimited ones.
  if (!(await rateLimitShared(`store-invite:${access.tenantId}`, 20, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "You've sent a lot of invitations in the last hour. Please try again later." }, { status: 429 });
  }

  try {
    const members = await listTeamMembers(access.tenantId);
    if (members.some((m) => m.email.toLowerCase() === email)) {
      return NextResponse.json({ error: "That person is already on your team.", field: "email" }, { status: 409 });
    }

    const store = await storeNameAndSlug(access.tenantId);
    const { invite, token, refreshed } = await createOrRefreshInvite({ tenantId: access.tenantId, email, name, role, invitedBy: access.userId });
    await sendInviteEmail({ to: email, name, storeName: store?.storeName || access.storeDisplayName, role, invitedByName: access.currentUserName, token });
    await logActivity({
      tenantId: access.tenantId,
      actor: access,
      area: "staff",
      action: refreshed ? "invite_resent" : "invited",
      targetId: invite.id,
      targetLabel: `${name} (${email})`,
      changes: { role: { from: null, to: role } },
    });
    return NextResponse.json({ ok: true, inviteId: invite.id }, { status: 201 });
  } catch (error) {
    console.error("[team] invite failed", error);
    return NextResponse.json({ error: "We couldn't send the invitation. Please try again." }, { status: 500 });
  }
}
