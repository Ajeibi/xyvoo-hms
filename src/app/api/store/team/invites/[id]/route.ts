import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { logActivity } from "@/lib/store/activity";
import { featureUnavailable } from "@/lib/store/features";
import { rateLimitShared } from "@/lib/rate-limit";
import { cancelInvite, getInviteById, refreshInviteToken, sendInviteEmail, storeNameAndSlug } from "@/lib/store/team";

const notFound = () => NextResponse.json({ error: "That invitation no longer exists." }, { status: 404 });
const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

/** POST /api/store/team/invites/<id> { slug } — sends the invitation again with a new link. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageTeam) return NextResponse.json({ error: "Only the owner or an admin can send invitations." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "staff");
  if (blocked) return blocked;
  if (!isUuid(id)) return notFound();

  if (!(await rateLimitShared(`store-invite:${access.tenantId}`, 20, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "You've sent a lot of invitations in the last hour. Please try again later." }, { status: 429 });
  }

  const invite = await getInviteById(access.tenantId, id);
  if (!invite || invite.accepted_at || invite.cancelled_at) return notFound();

  try {
    const token = await refreshInviteToken(invite);
    const store = await storeNameAndSlug(access.tenantId);
    await sendInviteEmail({ to: invite.email, name: invite.name, storeName: store?.storeName || access.storeDisplayName, role: invite.role, invitedByName: access.currentUserName, token });
    await logActivity({ tenantId: access.tenantId, actor: access, area: "staff", action: "invite_resent", targetId: invite.id, targetLabel: `${invite.name} (${invite.email})` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[team] resend failed", error);
    return NextResponse.json({ error: "We couldn't send the invitation again. Please try again." }, { status: 500 });
  }
}

/** DELETE /api/store/team/invites/<id>?slug= — cancels an invitation; its link stops working at once. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageTeam) return NextResponse.json({ error: "Only the owner or an admin can cancel invitations." }, { status: 403 });
  if (!isUuid(id)) return notFound();

  const invite = await getInviteById(access.tenantId, id);
  if (!invite) return notFound();
  try {
    if (!(await cancelInvite(access.tenantId, id))) return notFound();
    await logActivity({ tenantId: access.tenantId, actor: access, area: "staff", action: "invite_cancelled", targetId: id, targetLabel: `${invite.name} (${invite.email})` });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[team] cancel failed", error);
    return NextResponse.json({ error: "We couldn't cancel the invitation. Please try again." }, { status: 500 });
  }
}
