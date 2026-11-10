import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { addEntry, deleteEntry, editEntry, setEntriesStatus } from "@/lib/hms/hr/hr-time";

const iso = z.string().datetime({ offset: true });

const Body = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("add"),
    employeeId: z.string().uuid(),
    clockIn: iso,
    clockOut: iso.nullable(),
    breakMinutes: z.number().int().min(0).max(600),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("edit"),
    id: z.string().uuid(),
    clockIn: iso,
    clockOut: iso.nullable(),
    breakMinutes: z.number().int().min(0).max(600),
    reason: z.string().trim().min(3).max(300),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("approve"), ids: z.array(z.string().uuid()).min(1).max(2000) }),
  z.object({ slug: z.string().min(1), action: z.literal("reopen"), ids: z.array(z.string().uuid()).min(1).max(2000) }),
  z.object({ slug: z.string().min(1), action: z.literal("delete"), id: z.string().uuid(), reason: z.string().trim().min(3).max(300) }),
]);

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Check the times and give a reason for the change.");
  const body = parsed.data;
  const a = await authHr(body.slug);
  if (isFailure(a)) return a;
  const { auth, actor } = a;
  const db = auth.service;
  const tenantId = auth.tenant.id;

  if ((body.action === "add" || body.action === "edit") && body.clockOut && body.clockOut <= body.clockIn) {
    return fail("Clock-out must be after clock-in.");
  }
  switch (body.action) {
    case "add": {
      const r = await addEntry(db, tenantId, body, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "edit": {
      const r = await editEntry(db, tenantId, body.id, body, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
    case "approve":
    case "reopen": {
      const r = await setEntriesStatus(db, tenantId, body.ids, body.action === "approve" ? "approved" : "pending", actor);
      return r.error ? fail(r.error) : NextResponse.json({ count: r.count });
    }
    case "delete": {
      const r = await deleteEntry(db, tenantId, body.id, body.reason, actor);
      return r.error ? fail(r.error) : NextResponse.json({ ok: true });
    }
  }
}
