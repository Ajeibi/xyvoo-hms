import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { groupInputSchema } from "@/lib/store/customer-groups";
import { createCustomerGroup } from "@/lib/store/customer-groups-server";
import { featureUnavailable } from "@/lib/store/features";

/** POST /api/store/customers/groups { slug, name, match, rules } — save a customer group. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can save customer groups." }, { status: 403 });
  const blocked = await featureUnavailable(access.tenantId, "customers");
  if (blocked) return blocked;

  const parsed = groupInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the group.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });

  const { group, error } = await createCustomerGroup(access.tenantId, access.userId, parsed.data);
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a group with that name." }, { status: 409 });
  if (error || !group) {
    console.error("[customer groups] create failed", error);
    return NextResponse.json({ error: "We couldn't save that group. Please try again." }, { status: 500 });
  }
  await logActivity({ tenantId: access.tenantId, actor: access, area: "customers", action: "group_created", targetId: group.id, targetLabel: group.name });
  return NextResponse.json({ group }, { status: 201 });
}
