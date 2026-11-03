import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { canCloseYear, closeYear, getYearEndPreview, listYearEnds, undoYearClose } from "@/lib/hms/year-end-close";

const YearSchema = z.coerce.number().int().min(2000).max(2200);
const PostBody = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("close"), year: YearSchema }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("undo"),
    year: YearSchema,
    reason: z.string().trim().min(1, "Say why the year-end close is being undone.").max(300),
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

    const year = url.searchParams.get("year");
    if (year) {
      const y = YearSchema.parse(year);
      const can = canCloseYear(y, todayIso());
      if (!can.ok) return NextResponse.json({ error: can.error }, { status: 400 });
      return NextResponse.json({ preview: await getYearEndPreview(auth.service, auth.tenant.id, y) });
    }
    return NextResponse.json({ years: await listYearEnds(auth.service, auth.tenant.id, todayIso()) });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[year-end GET]", e);
    return NextResponse.json({ error: "Failed to load year-end data." }, { status: 500 });
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
      const result = await closeYear(auth.service, {
        tenantId: auth.tenant.id,
        year: body.year,
        actorUserId: auth.user.id,
        today: todayIso(),
      });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "year_end_closed",
        entityType: "year_end_close",
        entityId: String(body.year),
        after: { year: body.year, netIncome: result.netIncome, journalEntryId: result.journalEntryId },
      });
      return NextResponse.json({ ok: true, netIncome: result.netIncome });
    }

    if (!caps.canReopenPeriod) {
      return NextResponse.json({ error: "Only the owner can undo a year-end close." }, { status: 403 });
    }
    const result = await undoYearClose(auth.service, {
      tenantId: auth.tenant.id,
      year: body.year,
      actorUserId: auth.user.id,
      reason: body.reason,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "year_end_undone",
      entityType: "year_end_close",
      entityId: String(body.year),
      after: { year: body.year, reason: body.reason },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[year-end POST]", e);
    return NextResponse.json({ error: "Failed to update the year-end close." }, { status: 500 });
  }
}
