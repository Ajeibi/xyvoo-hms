import { z } from "zod";
import { EDITORS, withGroup } from "@/lib/hms/groups/group-api";
import { confirmSuggestion, dismissSuggestion, runGuestMatching, unlinkGuest } from "@/lib/hms/groups/group-guests";

type Ctx = { params: Promise<{ groupSlug: string }> };

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("match") }),
  z.object({ action: z.literal("confirm"), matchKey: z.string().min(1) }),
  z.object({ action: z.literal("dismiss"), matchKey: z.string().min(1) }),
  z.object({ action: z.literal("unlink"), linkId: z.string().uuid() }),
]);

/** POST: run matching now, confirm or dismiss a suggested match, or unlink a guest (owner or admin). */
export async function POST(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, EDITORS, async (ctx) => {
    if (!ctx.sharing.shareGuests) throw new Error("Guest profiles aren't shared in this group. The group owner can switch it on in Settings.");
    const body = Body.parse(await req.json());
    if (body.action === "match") return runGuestMatching(ctx.service, ctx.group.id, ctx.userId);
    if (body.action === "confirm") await confirmSuggestion(ctx, body.matchKey);
    if (body.action === "dismiss") await dismissSuggestion(ctx, body.matchKey);
    if (body.action === "unlink") await unlinkGuest(ctx, body.linkId);
    return { ok: true };
  });
}
