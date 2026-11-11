import { z } from "zod";
import { setGroupSharing } from "@/lib/hms/groups/group-admin";
import { OWNER, withGroup } from "@/lib/hms/groups/group-api";
import { runGuestMatching } from "@/lib/hms/groups/group-guests";

type Ctx = { params: Promise<{ groupSlug: string }> };

/** PUT: what hotels share with each other (group owner; the database checks it too). */
export async function PUT(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, OWNER, async (ctx) => {
    const body = z.object({ shareGuests: z.boolean(), shareLoyalty: z.boolean(), shareRates: z.boolean(), matchByPhone: z.boolean() }).parse(await req.json());
    await setGroupSharing(ctx, body);
    // Switching guest sharing on links guests straight away rather than waiting for the night.
    const matching = body.shareGuests && !ctx.sharing.shareGuests ? await runGuestMatching(ctx.service, ctx.group.id, ctx.userId) : null;
    return { ok: true, matching };
  });
}
