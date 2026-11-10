import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { copyWeek, createShift, deleteTemplate, publishShifts, removeShift, saveTemplate, updateShift } from "@/lib/hms/hr/hr-rota";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const time = z.string().regex(/^\d{2}:\d{2}$/);

const ShiftFields = {
  employeeId: z.string().uuid().nullable(),
  department: z.string().max(80).nullable().optional(),
  position: z.string().max(80).nullable().optional(),
  shiftDate: date,
  startTime: time,
  endTime: time,
  breakMinutes: z.number().int().min(0).max(240),
  notes: z.string().max(500).nullable().optional(),
};

const Body = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("create"), ...ShiftFields }),
  z.object({ slug: z.string().min(1), action: z.literal("update"), id: z.string().uuid(), ...ShiftFields }),
  z.object({ slug: z.string().min(1), action: z.literal("remove"), id: z.string().uuid() }),
  z.object({ slug: z.string().min(1), action: z.literal("publish"), from: date, to: date, department: z.string().max(80).nullable() }),
  z.object({ slug: z.string().min(1), action: z.literal("copy_week"), fromStart: date, toStart: date, department: z.string().max(80).nullable() }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("template_save"),
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(60),
    department: z.string().max(80).nullable().optional(),
    position: z.string().max(80).nullable().optional(),
    startTime: time,
    endTime: time,
    breakMinutes: z.number().int().min(0).max(240),
    active: z.boolean(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("template_delete"), id: z.string().uuid() }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Check the shift details and try again.");
  const body = parsed.data;
  const a = await authHr(body.slug);
  if (isFailure(a)) return a;
  const { auth, actor } = a;
  const db = auth.service;
  const tenantId = auth.tenant.id;

  switch (body.action) {
    case "create": {
      const { slug: _s, action: _a, ...input } = body;
      void _s;
      void _a;
      const r = await createShift(db, tenantId, input, actor);
      return r.error ? fail(r.error) : NextResponse.json({ id: r.id });
    }
    case "update": {
      const { slug: _s, action: _a, id, ...input } = body;
      void _s;
      void _a;
      const r = await updateShift(db, tenantId, id, input, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "remove": {
      const r = await removeShift(db, tenantId, body.id, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "publish": {
      const hotelName = (auth.tenant as { display_name?: string | null; name?: string | null }).display_name || auth.tenant.name || "Your hotel";
      const r = await publishShifts(db, tenantId, body.from, body.to, body.department, actor, hotelName);
      return r.error ? fail(r.error) : NextResponse.json(r);
    }
    case "copy_week": {
      if (body.fromStart === body.toStart) return fail("Pick a different week to copy into.");
      const r = await copyWeek(db, tenantId, body.fromStart, body.toStart, body.department, actor);
      return NextResponse.json(r);
    }
    case "template_save": {
      const { slug: _s, action: _a, ...input } = body;
      void _s;
      void _a;
      const r = await saveTemplate(db, tenantId, input);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "template_delete": {
      const r = await deleteTemplate(db, tenantId, body.id);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
  }
}
