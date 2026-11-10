import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, canSeeHrPrivate, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { approvePayRun, createPayRun, markPayRunPaid, recalculatePayRun, voidPayRun } from "@/lib/hms/hr/hr-payroll";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const Body = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("create"), periodStart: date, periodEnd: date }),
  z.object({ slug: z.string().min(1), action: z.literal("recalculate"), id: z.string().uuid() }),
  z.object({ slug: z.string().min(1), action: z.literal("one_off"), id: z.string().uuid(), employeeId: z.string().uuid(), amount: z.number().min(0).max(1_000_000_000), note: z.string().max(200).nullable().optional() }),
  z.object({ slug: z.string().min(1), action: z.literal("approve"), id: z.string().uuid() }),
  z.object({ slug: z.string().min(1), action: z.literal("paid"), id: z.string().uuid(), paidOn: date }),
  z.object({ slug: z.string().min(1), action: z.literal("void"), id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Check the pay run details and try again.");
  const body = parsed.data;
  const a = await authHr(body.slug);
  if (isFailure(a)) return a;
  const { auth, actor, privateDb } = a;
  const tenantId = auth.tenant.id;
  // A friendly answer up front; the database refuses these tables to anyone else regardless.
  if (!(await canSeeHrPrivate(privateDb, tenantId))) return fail("Only the hotel's owner and the people they choose can run payroll.", 403);

  switch (body.action) {
    case "create": {
      const r = await createPayRun(privateDb, auth.service, tenantId, body.periodStart, body.periodEnd, actor);
      return r.error && !r.id ? fail(r.error) : NextResponse.json({ id: r.id, warning: r.error });
    }
    case "recalculate": {
      const r = await recalculatePayRun(privateDb, auth.service, tenantId, body.id, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "one_off": {
      const r = await recalculatePayRun(privateDb, auth.service, tenantId, body.id, actor, { employeeId: body.employeeId, amount: body.amount, note: body.note ?? null });
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "approve": {
      const r = await approvePayRun(privateDb, auth.service, tenantId, body.id, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "paid": {
      const r = await markPayRunPaid(privateDb, auth.service, tenantId, body.id, body.paidOn, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "void": {
      const r = await voidPayRun(privateDb, auth.service, tenantId, body.id, body.reason, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
  }
}
