import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { groupInputSchema } from "@/lib/store/customer-groups";
import { deleteCustomerGroup, updateCustomerGroup } from "@/lib/store/customer-groups-server";
import { featureUnavailable } from "@/lib/store/features";

const notFound = () => NextResponse.json({ error: "That group can't be found. It may already have been removed." }, { status: 404 });
const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can change customer groups." }, { status: 403 });

/** PUT /api/store/customers/groups/:id { slug, name, match, rules } */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageSettings) return ownersOnly();
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const blocked = await featureUnavailable(access.tenantId, "customers");
  if (blocked) return blocked;

  const parsed = groupInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the group.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });

  const { group, error } = await updateCustomerGroup(access.tenantId, id, parsed.data);
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a group with that name." }, { status: 409 });
  if (error) {
    console.error("[customer groups] update failed", error);
    return NextResponse.json({ error: "We couldn't save that group. Please try again." }, { status: 500 });
  }
  if (!group) return notFound();
  await logActivity({ tenantId: access.tenantId, actor: access, area: "customers", action: "group_updated", targetId: id, targetLabel: group.name });
  return NextResponse.json({ group });
}

/** DELETE /api/store/customers/groups/:id?slug= */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, capabilities } = resolved;
  if (!capabilities.canManageSettings) return ownersOnly();
  if (!z.string().uuid().safeParse(id).success) return notFound();

  const { name, error } = await deleteCustomerGroup(access.tenantId, id);
  if (error) {
    console.error("[customer groups] delete failed", error);
    return NextResponse.json({ error: "We couldn't remove that group. Please try again." }, { status: 500 });
  }
  if (!name) return notFound();
  await logActivity({ tenantId: access.tenantId, actor: access, area: "customers", action: "group_deleted", targetId: id, targetLabel: name });
  return NextResponse.json({ ok: true });
}
