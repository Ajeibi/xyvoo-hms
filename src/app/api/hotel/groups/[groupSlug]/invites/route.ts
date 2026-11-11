import { z } from "zod";
import { cancelGroupInvite, createGroupInvite, listGroupInvites } from "@/lib/hms/groups/group-admin";
import { OWNER, withGroup } from "@/lib/hms/groups/group-api";

type Ctx = { params: Promise<{ groupSlug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => ({ invites: await listGroupInvites(ctx) }));
}

/** POST: invite a hotel (group owner). The invited hotel's owner must accept. */
export async function POST(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const body = z.object({ hotelSlug: z.string().min(1).max(200), note: z.string().max(500).nullable().optional() }).parse(await req.json());
    return createGroupInvite(ctx, body.hotelSlug, body.note ?? null);
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const id = z.string().uuid().parse(new URL(req.url).searchParams.get("id"));
    await cancelGroupInvite(ctx, id);
    return { ok: true };
  });
}
