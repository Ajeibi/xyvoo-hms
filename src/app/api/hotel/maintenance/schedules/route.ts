import { NextResponse } from "next/server";
import { z } from "zod";
import { authMaintenance, fail, isFailure } from "@/lib/hms/maintenance-api";
import { generateDueSchedules, listSchedules, saveSchedule } from "@/lib/hms/maintenance-schedules";
import { WO_PRIORITIES } from "@/lib/hms/maintenance-shared";

const Save = z.object({
  slug: z.string().min(1),
  action: z.literal("save"),
  id: z.string().uuid().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  category: z.string().max(80).nullable().optional(),
  priority: z.enum(WO_PRIORITIES).optional(),
  everyN: z.number().int().min(1).max(520),
  unit: z.enum(["day", "week", "month", "year"]),
  nextDue: z.string(),
  leadDays: z.number().int().min(0).max(90).optional(),
  assetId: z.string().uuid().nullable().optional(),
  roomUnitId: z.string().uuid().nullable().optional(),
  locationText: z.string().max(200).nullable().optional(),
  technicianId: z.string().uuid().nullable().optional(),
  active: z.boolean().optional(),
});
const Run = z.object({ slug: z.string().min(1), action: z.literal("run") });

export async function GET(req: Request) {
  const a = await authMaintenance(new URL(req.url).searchParams.get("slug"));
  if (isFailure(a)) return a;
  return NextResponse.json({ schedules: await listSchedules(a.auth.service, a.auth.tenant.id) });
}

/** POST { action: "save" } adds or edits a schedule; { action: "run" } makes any orders that are due now. */
export async function POST(req: Request) {
  try {
    const raw = await req.json();
    const body = z.union([Save, Run]).parse(raw);
    const a = await authMaintenance(body.slug, "canManage");
    if (isFailure(a)) return a;
    if (body.action === "run") {
      const made = await generateDueSchedules(a.auth.service, a.auth.tenant.id);
      return NextResponse.json({ ok: true, made });
    }
    const { id, slug: _slug, action: _action, ...input } = body;
    void _slug;
    void _action;
    const r = await saveSchedule(a.auth.service, a.auth.tenant.id, a.actor, input, id);
    if (r.error) return fail(r.error);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not save the schedule.", 500);
  }
}
