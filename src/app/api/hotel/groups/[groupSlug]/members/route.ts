import { z } from "zod";
import { addGroupMember, changeGroupMember, removeGroupMember } from "@/lib/hms/groups/group-admin";
import { OWNER, withGroup } from "@/lib/hms/groups/group-api";
import { GROUP_ROLES } from "@/lib/hms/groups/group-types";

type Ctx = { params: Promise<{ groupSlug: string }> };
const Role = z.enum(GROUP_ROLES);

/** POST: give an existing XYVOO login a role in the group (group owner). */
export async function POST(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const body = z.object({ email: z.string().email("Enter an email address."), role: Role }).parse(await req.json());
    await addGroupMember(ctx, body.email, body.role);
    return { ok: true };
  });
}

/** PATCH: change someone's role or whether they get the report email (group owner). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const body = z.object({ id: z.string().uuid(), role: Role.optional(), receivesReports: z.boolean().optional() }).parse(await req.json());
    await changeGroupMember(ctx, body.id, { role: body.role, receivesReports: body.receivesReports });
    return { ok: true };
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const id = z.string().uuid().parse(new URL(req.url).searchParams.get("id"));
    await removeGroupMember(ctx, id);
    return { ok: true };
  });
}
