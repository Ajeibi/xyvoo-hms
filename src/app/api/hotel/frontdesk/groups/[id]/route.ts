import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import type { HmsSectionKey } from "@/lib/hms/department-access";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArrivalsCapabilities } from "@/lib/hms/arrivals-rbac";
import { addToGroup, dissolveGroup, loadGroups, removeFromGroup } from "@/lib/hms/frontdesk-groups";

const SECTIONS: HmsSectionKey[] = ["frontdesk", "reservations"];

const PatchSchema = z.object({
  slug: z.string().min(1),
  add: z.array(z.string().uuid()).max(60).default([]),
  remove: z.array(z.string().uuid()).max(60).default([]),
});

async function guard(slug: string) {
  const auth = await requireHotelApiSection(slug, SECTIONS);
  if ("error" in auth) return { response: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const caps = getArrivalsCapabilities(auth.departmentRole ?? auth.role);
  if (!caps.canCheckIn) return { response: NextResponse.json({ error: "Not allowed." }, { status: 403 }) };
  return { auth };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const g = await guard(body.slug);
    if (!g.auth) return g.response;
    const { auth } = g;

    const [group] = await loadGroups(auth.service, auth.tenant.id, id);
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });

    let added = 0;
    if (body.remove.length) await removeFromGroup(auth.service, auth.tenant.id, id, body.remove);
    if (body.add.length) added = await addToGroup(auth.service, auth.tenant.id, id, body.add);

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "group_changed",
      entityType: "group_booking",
      entityId: id,
      after: { added, removed: body.remove.length },
    });
    return NextResponse.json({ ok: true, added });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[groups PATCH]", e);
    return NextResponse.json({ error: "Failed to change the group." }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const g = await guard(slug);
    if (!g.auth) return g.response;
    const { auth } = g;

    const [group] = await loadGroups(auth.service, auth.tenant.id, id);
    if (!group) return NextResponse.json({ error: "Group not found." }, { status: 404 });
    await dissolveGroup(auth.service, auth.tenant.id, id);
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "group_dissolved",
      entityType: "group_booking",
      entityId: id,
      before: { name: group.name, rooms: group.members.length },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[groups DELETE]", e);
    return NextResponse.json({ error: "Failed to break up the group." }, { status: 500 });
  }
}
