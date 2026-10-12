import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { logActivity } from "@/lib/store/activity";
import { featureUnavailable } from "@/lib/store/features";
import { changeMember, listTeamMembers } from "@/lib/store/team";
import { CHANGE_RESULT_MESSAGES, memberChangeError } from "@/lib/store/team-rules";

const notFound = () => NextResponse.json({ error: CHANGE_RESULT_MESSAGES.not_found }, { status: 404 });

async function findMember(tenantId: string, userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  return (await listTeamMembers(tenantId)).find((m) => m.userId === userId) ?? null;
}

/** PATCH /api/store/team/members/<userId> { slug, role } — changes someone's role (Standard plan). */
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access } = resolved;
  if (!resolved.capabilities.canManageTeam) return NextResponse.json({ error: "Only the owner or an admin can change roles." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "staff");
  if (blocked) return blocked;

  const target = await findMember(access.tenantId, userId);
  if (!target) return notFound();
  const newRole = typeof body?.role === "string" ? body.role : "";
  const problem = memberChangeError({ actorRole: access.role, actorUserId: access.userId, targetRole: target.role, targetUserId: userId, newRole });
  if (problem) return NextResponse.json({ error: problem }, { status: 403 });

  try {
    const result = await changeMember(access.tenantId, userId, newRole);
    if (result !== "ok") return NextResponse.json({ error: CHANGE_RESULT_MESSAGES[result] ?? "We couldn't change the role." }, { status: 409 });
    await logActivity({
      tenantId: access.tenantId,
      actor: access,
      area: "staff",
      action: "role_changed",
      targetId: userId,
      targetLabel: target.name,
      changes: { role: { from: target.role, to: newRole } },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[team] role change failed", error);
    return NextResponse.json({ error: "We couldn't change the role. Please try again." }, { status: 500 });
  }
}

/**
 * DELETE /api/store/team/members/<userId>?slug= — removes someone. Their
 * access ends on their next request, because every dashboard page and API
 * reads the membership afresh. Allowed on any plan, so a shop that has moved
 * to Free can still remove people.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access } = resolved;
  if (!resolved.capabilities.canManageTeam) return NextResponse.json({ error: "Only the owner or an admin can remove people." }, { status: 403 });

  const target = await findMember(access.tenantId, userId);
  if (!target) return notFound();
  const problem = memberChangeError({ actorRole: access.role, actorUserId: access.userId, targetRole: target.role, targetUserId: userId, newRole: null });
  if (problem) return NextResponse.json({ error: problem }, { status: 403 });

  try {
    const result = await changeMember(access.tenantId, userId, null);
    if (result !== "ok") return NextResponse.json({ error: CHANGE_RESULT_MESSAGES[result] ?? "We couldn't remove them." }, { status: 409 });
    const self = userId === access.userId;
    await logActivity({
      tenantId: access.tenantId,
      actor: access,
      area: "staff",
      action: self ? "left" : "removed",
      targetId: userId,
      targetLabel: target.name,
      changes: { role: { from: target.role, to: null } },
    });
    return NextResponse.json({ ok: true, self });
  } catch (error) {
    console.error("[team] remove failed", error);
    return NextResponse.json({ error: "We couldn't remove them. Please try again." }, { status: 500 });
  }
}
