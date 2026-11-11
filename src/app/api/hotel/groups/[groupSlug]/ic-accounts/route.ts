import { z } from "zod";
import { markInterCompany, unmarkInterCompany } from "@/lib/hms/groups/group-accounts";
import { EDITORS, withGroup } from "@/lib/hms/groups/group-api";

type Ctx = { params: Promise<{ groupSlug: string }> };
const Body = z.object({ tenantId: z.string().uuid(), code: z.string().min(1).max(40), note: z.string().max(200).nullable().optional() });

/** POST: mark a hotel's account as inter-company (group owner or admin). */
export async function POST(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, EDITORS, async (ctx) => {
    const body = Body.parse(await req.json());
    await markInterCompany(ctx, body.tenantId, body.code, body.note ?? null);
    return { ok: true };
  });
}

export async function DELETE(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, EDITORS, async (ctx) => {
    const url = new URL(req.url);
    const body = Body.pick({ tenantId: true, code: true }).parse({ tenantId: url.searchParams.get("tenantId"), code: url.searchParams.get("code") });
    await unmarkInterCompany(ctx, body.tenantId, body.code);
    return { ok: true };
  });
}
