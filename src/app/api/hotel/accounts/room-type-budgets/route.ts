import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isMonthStart } from "@/lib/hms/accounting-periods";
import { getRoomTypeBudgetGrid, saveRoomTypeBudgets } from "@/lib/hms/room-type-budgets";

const PostBody = z.object({
  slug: z.string().min(1),
  entries: z
    .array(
      z.object({
        roomTypeId: z.string().min(1).max(200),
        month: z.string().refine(isMonthStart, "Pick a month."),
        amount: z.number().min(0, "A budget cannot be negative."),
      }),
    )
    .min(1)
    .max(1000),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    const year = Number(url.searchParams.get("year") ?? new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2200) return NextResponse.json({ error: "Pick a year." }, { status: 400 });
    return NextResponse.json({ rows: await getRoomTypeBudgetGrid(auth.service, auth.tenant.id, year) });
  } catch (e) {
    console.error("[room-type-budgets GET]", e);
    return NextResponse.json({ error: "Failed to load room type budgets." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageChartOfAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await saveRoomTypeBudgets(auth.service, { tenantId: auth.tenant.id, actorUserId: auth.user.id, entries: body.entries });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "room_type_budgets_saved",
      entityType: "room_type_budget",
      after: { entries: result.saved },
    });
    return NextResponse.json({ ok: true, saved: result.saved });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[room-type-budgets POST]", e);
    return NextResponse.json({ error: "Failed to save room type budgets." }, { status: 500 });
  }
}
