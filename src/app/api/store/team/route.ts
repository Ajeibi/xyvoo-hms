import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { getStorePlan, storeHasFeature } from "@/lib/store/features";
import { listOpenInvites, listTeamMembers } from "@/lib/store/team";
import { inviteState } from "@/lib/store/team-rules";

/** GET /api/store/team?slug= — members and open invitations. Owners and admins only. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageTeam) return NextResponse.json({ error: "Only the owner or an admin can see the team." }, { status: 403 });

  try {
    const [members, invites, plan] = await Promise.all([listTeamMembers(access.tenantId), listOpenInvites(access.tenantId), getStorePlan(access.tenantId)]);
    return NextResponse.json({
      you: { userId: access.userId, role: access.role },
      canInvite: storeHasFeature(plan, "staff"),
      members,
      invites: invites.map((i) => ({
        id: i.id,
        name: i.name,
        email: i.email,
        role: i.role,
        state: inviteState(i),
        expiresAt: i.expires_at,
        createdAt: i.created_at,
      })),
    });
  } catch (error) {
    console.error("[team] list failed", error);
    return NextResponse.json({ error: "We couldn't load your team. Please refresh the page." }, { status: 500 });
  }
}
