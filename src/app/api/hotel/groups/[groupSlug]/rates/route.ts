import { z } from "zod";
import { EDITORS, withGroup } from "@/lib/hms/groups/group-api";
import { deleteRateTemplate, pushRateTemplate, saveRateTemplate, withdrawRateTemplate } from "@/lib/hms/groups/group-rates";

type Ctx = { params: Promise<{ groupSlug: string }> };

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Template = z.object({
  code: z.string().min(1).max(24),
  name: z.string().min(2).max(80),
  description: z.string().max(500).nullable(),
  deriveKind: z.enum(["percent", "amount"]),
  deriveValue: z.number(),
  boardBasis: z.string().max(60),
  refundable: z.boolean(),
  prepayRequired: z.boolean(),
  channels: z.array(z.enum(["front_desk", "website", "ota"])),
  sellFrom: IsoDate.nullable(),
  sellTo: IsoDate.nullable(),
  active: z.boolean(),
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), id: z.string().uuid().nullable(), template: Template }),
  z.object({ action: z.literal("push"), templateId: z.string().uuid(), tenantIds: z.array(z.string().uuid()).min(1) }),
  z.object({ action: z.literal("withdraw"), templateId: z.string().uuid(), tenantId: z.string().uuid() }),
  z.object({ action: z.literal("delete"), templateId: z.string().uuid() }),
]);

/** POST: save a group rate, send it to hotels, take it off a hotel, or delete it (owner or admin). */
export async function POST(req: Request, { params }: Ctx) {
  const { groupSlug } = await params;
  return withGroup(groupSlug, EDITORS, async (ctx) => {
    const body = Body.parse(await req.json());
    if (body.action === "save") return saveRateTemplate(ctx, body.id, body.template);
    if (body.action === "push") return { results: await pushRateTemplate(ctx, body.templateId, body.tenantIds) };
    if (body.action === "withdraw") await withdrawRateTemplate(ctx, body.templateId, body.tenantId);
    if (body.action === "delete") await deleteRateTemplate(ctx, body.templateId);
    return { ok: true };
  });
}
