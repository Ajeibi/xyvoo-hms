import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { ACCOUNT_TYPES, createAccount, listChartOfAccounts } from "@/lib/hms/chart-of-accounts";

const PostBody = z.object({
  slug: z.string().min(1),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120),
  type: z.enum(ACCOUNT_TYPES),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const activeOnly = url.searchParams.get("activeOnly") === "true";
    const accounts = await listChartOfAccounts(auth.service, auth.tenant.id, { activeOnly });
    return NextResponse.json({ accounts });
  } catch (e) {
    console.error("[chart-of-accounts GET]", e);
    return NextResponse.json({ error: "Failed to load chart of accounts." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageChartOfAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await createAccount(auth.service, {
      tenantId: auth.tenant.id,
      code: body.code,
      name: body.name,
      type: body.type,
      parentId: body.parentId ?? null,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[chart-of-accounts POST]", e);
    return NextResponse.json({ error: "Failed to create account." }, { status: 500 });
  }
}
