import { z } from "zod";
import { renameGroup } from "@/lib/hms/groups/group-admin";
import { OWNER, withGroup } from "@/lib/hms/groups/group-api";

type Ctx = { params: Promise<{ groupSlug: string }> };

/** PATCH: rename the group (group owner). */
export async function PATCH(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const body = z.object({ name: z.string().min(2).max(120) }).parse(await req.json());
    await renameGroup(ctx, body.name);
    return { ok: true };
  });
}
