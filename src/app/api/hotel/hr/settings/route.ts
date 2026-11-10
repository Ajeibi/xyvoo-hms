import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { rotateKioskToken, saveHrSettings, saveLeaveType, setAccessGrant } from "@/lib/hms/hr/hr-settings";

const code = z.string().trim().regex(/^[0-9A-Za-z.-]{2,12}$/);

const Body = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("settings"),
    departments: z.array(z.string().trim().min(1).max(60)).min(1).max(40).optional(),
    weekStartsOn: z.number().int().min(0).max(6).optional(),
    minRestHours: z.number().min(0).max(24).optional(),
    maxWeeklyHours: z.number().min(1).max(120).optional(),
    lateGraceMinutes: z.number().int().min(0).max(120).optional(),
    overtimeAfterWeeklyHours: z.number().min(1).max(120).optional(),
    overtimeMultiplier: z.number().min(1).max(5).optional(),
    kioskEnabled: z.boolean().optional(),
    kioskSelfService: z.boolean().optional(),
    pensionEnabled: z.boolean().optional(),
    nsitfEnabled: z.boolean().optional(),
    itfEnabled: z.boolean().optional(),
    payDay: z.number().int().min(1).max(31).optional(),
    expenseAccountCode: code.optional(),
    payeAccountCode: code.optional(),
    statutoryAccountCode: code.optional(),
    netPayAccountCode: code.optional(),
    bankAccountCode: code.optional(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("kiosk_link") }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("leave_type"),
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(60),
    paid: z.boolean(),
    daysPerYear: z.number().min(0).max(366),
    carryOverMax: z.number().min(0).max(366),
    countsAgainstBalance: z.boolean(),
    active: z.boolean(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("grant"), userId: z.string().uuid(), granted: z.boolean() }),
]);

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Some settings aren't valid. Check them and try again.");
  const body = parsed.data;
  const a = await authHr(body.slug);
  if (isFailure(a)) return a;
  const { auth, actor } = a;
  const tenantId = auth.tenant.id;

  switch (body.action) {
    case "settings": {
      const { slug: _s, action: _a, ...patch } = body;
      void _s;
      void _a;
      const r = await saveHrSettings(auth.service, tenantId, patch);
      if (r.error) return fail(r.error);
      await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.settings.updated", entityType: "hr_settings", after: patch });
      return NextResponse.json({ ok: true });
    }
    case "kiosk_link": {
      const r = await rotateKioskToken(auth.service, tenantId);
      if (r.error || !r.token) return fail(r.error ?? "Couldn't make the link.");
      await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.kiosk.link_rotated", entityType: "hr_settings" });
      return NextResponse.json({ token: r.token });
    }
    case "leave_type": {
      const { slug: _s, action: _a, ...input } = body;
      void _s;
      void _a;
      const r = await saveLeaveType(auth.service, tenantId, input);
      if (r.error) return fail(r.error);
      await writeAuditLog({ tenantId, actorUserId: actor.userId, action: "hr.leave_type.saved", entityType: "hr_leave_type", entityId: input.id ?? null, after: input });
      return NextResponse.json({ ok: true });
    }
    case "grant": {
      // Only the owner decides who sees pay and personal details.
      if (!a.isOwner) return fail("Only the hotel's owner can choose who sees pay and personal details.", 403);
      if (body.userId === actor.userId) return fail("The owner can always see them.");
      const r = await setAccessGrant(auth.service, tenantId, body.userId, body.granted, actor.userId);
      if (r.error) return fail(r.error);
      await writeAuditLog({
        tenantId,
        actorUserId: actor.userId,
        action: body.granted ? "hr.private_access.granted" : "hr.private_access.removed",
        entityType: "hr_access_grant",
        entityId: body.userId,
      });
      return NextResponse.json({ ok: true });
    }
  }
}
