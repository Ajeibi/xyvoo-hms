import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getTaxYear, saveWhtRate } from "@/lib/hms/tax-reports";

const PostBody = z.object({ slug: z.string().min(1), whtRate: z.number().min(0).max(100) });

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
    return NextResponse.json(await getTaxYear(auth.service, auth.tenant.id, year));
  } catch (e) {
    console.error("[tax GET]", e);
    return NextResponse.json({ error: "Failed to load the tax report." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageChartOfAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await saveWhtRate(auth.service, { tenantId: auth.tenant.id, actorUserId: auth.user.id, rate: body.whtRate });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "wht_rate_changed",
      entityType: "tax_settings",
      after: { whtRate: body.whtRate },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[tax POST]", e);
    return NextResponse.json({ error: "Failed to save the tax settings." }, { status: 500 });
  }
}
