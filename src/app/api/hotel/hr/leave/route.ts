import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { getEmployee } from "@/lib/hms/hr/hr-employees";
import { addAdjustment, cancelLeave, decideLeave, requestLeave } from "@/lib/hms/hr/hr-leave";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Body = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("create"),
    employeeId: z.string().uuid(),
    leaveTypeId: z.string().uuid(),
    startDate: date,
    endDate: date,
    days: z.number().min(0.5).max(366).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    approveNow: z.boolean().optional(),
    allowOverBalance: z.boolean().optional(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("decide"), id: z.string().uuid(), approve: z.boolean(), note: z.string().max(500).nullable().optional(), releaseShifts: z.boolean().optional() }),
  z.object({ slug: z.string().min(1), action: z.literal("cancel"), id: z.string().uuid() }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("adjust"),
    employeeId: z.string().uuid(),
    leaveTypeId: z.string().uuid(),
    year: z.number().int().min(2000).max(2100),
    days: z.number().min(-366).max(366).refine((d) => d !== 0),
    reason: z.string().trim().min(3).max(300),
  }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Check the leave details and try again.");
  const body = parsed.data;
  const a = await authHr(body.slug);
  if (isFailure(a)) return a;
  const { auth, actor } = a;
  const db = auth.service;
  const tenantId = auth.tenant.id;

  switch (body.action) {
    case "create": {
      const employee = await getEmployee(db, tenantId, body.employeeId);
      if (!employee) return fail("Staff record not found.", 404);
      const r = await requestLeave(db, tenantId, employee, body, "hr", actor, { approveNow: body.approveNow, allowOverBalance: body.allowOverBalance });
      return r.error ? fail(r.error) : NextResponse.json({ id: r.id, warning: r.warning });
    }
    case "decide": {
      const r = await decideLeave(db, tenantId, body.id, body.approve, body.note ?? null, body.releaseShifts ?? true, actor);
      return r.error ? fail(r.error) : NextResponse.json({ released: r.released });
    }
    case "cancel": {
      const r = await cancelLeave(db, tenantId, body.id, { actor });
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "adjust": {
      const r = await addAdjustment(db, tenantId, body, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
  }
}
