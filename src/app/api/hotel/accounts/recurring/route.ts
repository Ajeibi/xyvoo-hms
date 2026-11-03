import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isMonthStart } from "@/lib/hms/accounting-periods";
import { createRecurring, listRecurring, runDueRecurring } from "@/lib/hms/recurring-entries";

const MonthSchema = z.string().refine(isMonthStart, "Pick a month.");
const Line = z.object({
  accountId: z.string().uuid(),
  department: z.string().max(60).nullish(),
  description: z.string().max(200).nullish(),
  debit: z.number().min(0),
  credit: z.number().min(0),
});
const PostBody = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("create_journal"),
    name: z.string().trim().min(1).max(120),
    dayOfMonth: z.number().int().min(1).max(28),
    startMonth: MonthSchema,
    endMonth: MonthSchema.nullish(),
    memo: z.string().trim().min(1).max(240),
    lines: z.array(Line).min(2).max(30),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("create_bill"),
    name: z.string().trim().min(1).max(120),
    dayOfMonth: z.number().int().min(1).max(28),
    startMonth: MonthSchema,
    endMonth: MonthSchema.nullish(),
    vendorId: z.string().uuid(),
    department: z.string().min(1).max(60),
    expenseAccountId: z.string().uuid(),
    subtotal: z.number().positive(),
    tax: z.number().min(0).default(0),
    currency: z.string().min(1).max(10),
    reference: z.string().max(80).default(""),
    dueInDays: z.number().int().min(0).max(365).default(30),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("toggle"), id: z.string().uuid(), active: z.boolean() }),
  z.object({ slug: z.string().min(1), action: z.literal("delete"), id: z.string().uuid() }),
  z.object({ slug: z.string().min(1), action: z.literal("run") }),
]);

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    return NextResponse.json({ templates: await listRecurring(auth.service, auth.tenant.id) });
  } catch (e) {
    console.error("[recurring GET]", e);
    return NextResponse.json({ error: "Failed to load recurring entries." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canPostJournalEntry) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const base = { tenantId: auth.tenant.id, actorUserId: auth.user.id };
    const audit = (action: string, entityId: string | null, after: Record<string, unknown>) =>
      writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action, entityType: "recurring_template", entityId, after });

    if (body.action === "create_journal" || body.action === "create_bill") {
      const result =
        body.action === "create_journal"
          ? await createRecurring(auth.service, {
              ...base,
              kind: "journal",
              name: body.name,
              dayOfMonth: body.dayOfMonth,
              startMonth: body.startMonth,
              endMonth: body.endMonth ?? null,
              payload: { memo: body.memo, lines: body.lines.map((l) => ({ ...l, department: l.department ?? null, description: l.description ?? null })) },
            })
          : await createRecurring(auth.service, {
              ...base,
              kind: "bill",
              name: body.name,
              dayOfMonth: body.dayOfMonth,
              startMonth: body.startMonth,
              endMonth: body.endMonth ?? null,
              payload: {
                vendorId: body.vendorId,
                department: body.department,
                expenseAccountId: body.expenseAccountId,
                subtotal: body.subtotal,
                tax: body.tax,
                currency: body.currency,
                reference: body.reference,
                dueInDays: body.dueInDays,
              },
            });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await audit("recurring_created", result.id, { name: body.name, kind: body.action });
      return NextResponse.json({ ok: true, id: result.id });
    }

    if (body.action === "toggle") {
      const { error } = await auth.service.schema("hotel").from("recurring_templates").update({ active: body.active }).eq("tenant_id", auth.tenant.id).eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit(body.active ? "recurring_resumed" : "recurring_paused", body.id, { active: body.active });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "delete") {
      const { error } = await auth.service.schema("hotel").from("recurring_templates").delete().eq("tenant_id", auth.tenant.id).eq("id", body.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      await audit("recurring_deleted", body.id, {});
      return NextResponse.json({ ok: true });
    }

    const result = await runDueRecurring(auth.service, { tenantId: auth.tenant.id, today: new Date().toISOString().slice(0, 10) });
    if (result.posted > 0) await audit("recurring_run", null, { posted: result.posted, failed: result.failed.length });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[recurring POST]", e);
    return NextResponse.json({ error: "Failed to update recurring entries." }, { status: 500 });
  }
}
