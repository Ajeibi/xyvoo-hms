import { z } from "zod";
import { removeHotelFromGroup } from "@/lib/hms/groups/group-admin";
import { OWNER, withGroup } from "@/lib/hms/groups/group-api";

type Ctx = { params: Promise<{ groupSlug: string }> };

/** DELETE ?tenantId=: take a hotel out of the group (group owner; the database checks it too). */
export async function DELETE(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const tenantId = z.string().uuid().parse(new URL(req.url).searchParams.get("tenantId"));
    if (!ctx.hotels.some((h) => h.tenantId === tenantId)) throw new Error("That hotel isn't in this group.");
    await removeHotelFromGroup(ctx.userDb, tenantId);
    return { ok: true };
  });
}
