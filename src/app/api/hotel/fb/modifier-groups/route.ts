import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteModifierGroup, loadModifierSetup, saveModifierGroup } from "@/lib/hms/fb-modifiers";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { fbForbidden, requireFbApi } from "../_lib";

const SaveSchema = z
  .object({
    slug: z.string().min(1),
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, "Give the group a name.").max(60),
    minSelect: z.coerce.number().int().min(0).max(20),
    maxSelect: z.coerce.number().int().min(1).max(20).nullable(),
    isActive: z.boolean().default(true),
    options: z
      .array(
        z.object({
          id: z.string().uuid().optional(),
          name: z.string().trim().min(1, "Every choice needs a name.").max(60),
          priceDelta: z.coerce.number().min(-10_000_000).max(10_000_000),
          isActive: z.boolean().default(true),
        }),
      )
      .min(1, "Add at least one choice.")
      .max(40),
    menuItemIds: z.array(z.string().uuid()).max(500),
  })
  .superRefine((v, ctx) => {
    if (v.maxSelect != null && v.maxSelect < v.minSelect) {
      ctx.addIssue({ code: "custom", message: "The most they can choose can't be less than the fewest." });
    }
    const active = v.options.filter((o) => o.isActive).length;
    if (v.minSelect > active) {
      ctx.addIssue({ code: "custom", message: "Guests must choose more options than are on offer." });
    }
    const names = v.options.map((o) => o.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", message: "Two choices have the same name." });
    }
  });

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  const auth = await requireFbApi(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const setup = await loadModifierSetup(auth.service, auth.tenant.id);
  return NextResponse.json(setup);
}

export async function POST(req: Request) {
  try {
    const body = SaveSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const saved = await saveModifierGroup(auth.service, auth.tenant.id, body);
    if (saved.error) return NextResponse.json({ error: saved.error }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: body.id ? "fb_modifier_group_updated" : "fb_modifier_group_created",
      entityType: "fb_modifier_group",
      entityId: saved.groupId,
      after: {
        name: body.name,
        min_select: body.minSelect,
        max_select: body.maxSelect,
        options: body.options.map((o) => `${o.name} ${o.priceDelta}`),
        menu_items: body.menuItemIds.length,
      },
    });

    const setup = await loadModifierSetup(auth.service, auth.tenant.id);
    return NextResponse.json({ ok: true, groupId: saved.groupId, ...setup });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug") ?? "";
  const id = z.string().uuid().safeParse(url.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid group." }, { status: 400 });

  const auth = await requireFbApi(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const denied = fbForbidden(auth.capabilities, "canConfigure");
  if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

  const result = await deleteModifierGroup(auth.service, auth.tenant.id, id.data);
  if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });

  await writeAuditLog({
    tenantId: auth.tenant.id,
    actorUserId: auth.user.id,
    action: "fb_modifier_group_deleted",
    entityType: "fb_modifier_group",
    entityId: id.data,
  });

  const setup = await loadModifierSetup(auth.service, auth.tenant.id);
  return NextResponse.json({ ok: true, ...setup });
}
