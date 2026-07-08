import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteTable,
  upsertMenuCategory,
  upsertMenuItem,
  upsertStation,
  upsertTable,
} from "@/lib/hms/fb-menu";
import { fbForbidden, requireFbApi } from "../_lib";

const BodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("category"),
    slug: z.string().min(1),
    id: z.string().uuid().optional(),
    outletId: z.string().uuid(),
    name: z.string().min(1).max(80),
    sortOrder: z.number().int().optional(),
    prepMinutes: z.number().int().min(1).max(240).nullable().optional(),
  }),
  z.object({
    type: z.literal("item"),
    slug: z.string().min(1),
    id: z.string().uuid().optional(),
    outletId: z.string().uuid(),
    categoryId: z.string().uuid().optional().nullable(),
    stationId: z.string().uuid().optional().nullable(),
    name: z.string().min(1).max(120),
    price: z.coerce.number().nonnegative(),
    description: z.string().max(300).optional(),
  }),
  z.object({
    type: z.literal("table"),
    slug: z.string().min(1),
    id: z.string().uuid().optional(),
    outletId: z.string().uuid(),
    tableCode: z.string().min(1).max(20),
    covers: z.coerce.number().int().min(1).max(20),
  }),
  z.object({
    type: z.literal("station"),
    slug: z.string().min(1),
    id: z.string().uuid().optional(),
    name: z.string().min(1).max(80),
    code: z.string().min(1).max(32).optional(),
    sortOrder: z.number().int().optional(),
  }),
]);

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    if (body.type === "category") {
      const result = await upsertMenuCategory(auth.service, auth.tenant.id, {
        id: body.id,
        outletId: body.outletId,
        name: body.name,
        sortOrder: body.sortOrder,
        prepMinutes: body.prepMinutes,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, category: result.category });
    }

    if (body.type === "item") {
      const result = await upsertMenuItem(auth.service, auth.tenant.id, {
        id: body.id,
        outletId: body.outletId,
        categoryId: body.categoryId,
        stationId: body.stationId,
        name: body.name,
        price: body.price,
        description: body.description,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, item: result.item });
    }

    if (body.type === "station") {
      const result = await upsertStation(auth.service, auth.tenant.id, {
        id: body.id,
        name: body.name,
        code: body.code,
        sortOrder: body.sortOrder,
      });
      if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ ok: true, station: result.station });
    }

    const result = await upsertTable(auth.service, auth.tenant.id, {
      id: body.id,
      outletId: body.outletId,
      tableCode: body.tableCode,
      covers: body.covers,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, table: result.table });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const DeleteSchema = z.object({
  slug: z.string().min(1),
  type: z.literal("table"),
  id: z.string().uuid(),
});

export async function DELETE(req: Request) {
  try {
    const body = DeleteSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canConfigure");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const result = await deleteTable(auth.service, auth.tenant.id, body.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
