import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import {
  getPeriodChecks,
  isMonthStart,
  listPeriods,
  setPeriodClosed,
  setPeriodReopened,
} from "@/lib/hms/accounting-periods";

const MonthSchema = z.string().refine(isMonthStart, "Pick a month.");
const PostBody = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("close"), month: MonthSchema }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("reopen"),
    month: MonthSchema,
    reason: z.string().trim().min(1, "Say why the month is being reopened.").max(300),
  }),
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const month = url.searchParams.get("month");
    if (month) {
      const parsed = MonthSchema.parse(month);
      const checks = await getPeriodChecks(auth.service, auth.tenant.id, parsed, todayIso());
      return NextResponse.json({ checks });
    }
    return NextResponse.json({ periods: await listPeriods(auth.service, auth.tenant.id) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[periods GET]", e);
    return NextResponse.json({ error: "Failed to load periods." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });

    if (body.action === "close") {
      if (!caps.canClosePeriod) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
      const result = await setPeriodClosed(auth.service, {
        tenantId: auth.tenant.id,
        month: body.month,
        actorUserId: auth.user.id,
        today: todayIso(),
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "accounting_period_closed",
        entityType: "accounting_period",
        entityId: body.month,
        after: { month: body.month, status: "closed" },
      });
      return NextResponse.json({ ok: true });
    }

    if (!caps.canReopenPeriod) {
      return NextResponse.json({ error: "Only the owner can reopen a closed month." }, { status: 403 });
    }
    const result = await setPeriodReopened(auth.service, {
      tenantId: auth.tenant.id,
      month: body.month,
      actorUserId: auth.user.id,
      reason: body.reason,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "accounting_period_reopened",
      entityType: "accounting_period",
      entityId: body.month,
      before: { month: body.month, status: "closed" },
      after: { month: body.month, status: "open", reason: body.reason },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[periods POST]", e);
    return NextResponse.json({ error: "Failed to update the period." }, { status: 500 });
  }
}
