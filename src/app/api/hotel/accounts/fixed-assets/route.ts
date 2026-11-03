import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { isMonthStart } from "@/lib/hms/accounting-periods";
import { createFixedAsset, disposeFixedAsset, listFixedAssets, runDepreciation } from "@/lib/hms/fixed-assets";

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date.");
const PostBody = z.discriminatedUnion("action", [
  z.object({
    slug: z.string().min(1),
    action: z.literal("create"),
    name: z.string().trim().min(1, "Give the asset a name.").max(120),
    category: z.string().trim().max(60).default("Equipment"),
    acquisitionDate: DATE,
    cost: z.number().positive("Cost must be more than zero."),
    salvageValue: z.number().min(0).default(0),
    lifeMonths: z.number().int().min(1).max(1200),
    method: z.enum(["straight_line", "declining_balance"]),
    department: z.string().trim().max(60).nullish(),
    paidFromAccountId: z.string().uuid().nullish(),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("depreciate"),
    throughMonth: z.string().refine(isMonthStart, "Pick a month."),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("dispose"),
    assetId: z.string().uuid(),
    disposedOn: DATE,
    proceeds: z.number().min(0).default(0),
    proceedsAccountId: z.string().uuid().nullish(),
  }),
]);

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export async function GET(req: Request) {
  try {
    const slug = new URL(req.url).searchParams.get("slug");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canViewReports) return NextResponse.json({ error: "Not allowed." }, { status: 403 });
    return NextResponse.json({ assets: await listFixedAssets(auth.service, auth.tenant.id) });
  } catch (e) {
    console.error("[fixed-assets GET]", e);
    return NextResponse.json({ error: "Failed to load fixed assets." }, { status: 500 });
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

    if (body.action === "create") {
      const result = await createFixedAsset(auth.service, { ...base, ...body });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "fixed_asset_registered",
        entityType: "fixed_asset",
        entityId: result.id,
        after: { assetCode: result.assetCode, name: body.name, cost: body.cost },
      });
      return NextResponse.json({ ok: true, id: result.id, assetCode: result.assetCode });
    }

    if (body.action === "depreciate") {
      const result = await runDepreciation(auth.service, { ...base, throughMonth: body.throughMonth, today: todayIso() });
      if (!result.ok) return NextResponse.json({ error: result.error, monthsPosted: result.monthsPosted }, { status: 400 });
      await writeAuditLog({
        tenantId: auth.tenant.id,
        actorUserId: auth.user.id,
        action: "depreciation_run",
        entityType: "fixed_asset",
        after: { throughMonth: body.throughMonth, monthsPosted: result.monthsPosted, total: result.total },
      });
      return NextResponse.json({ ok: true, monthsPosted: result.monthsPosted, total: result.total });
    }

    const result = await disposeFixedAsset(auth.service, { ...base, ...body, today: todayIso() });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "fixed_asset_disposed",
      entityType: "fixed_asset",
      entityId: body.assetId,
      after: { disposedOn: body.disposedOn, proceeds: body.proceeds, gain: result.gain },
    });
    return NextResponse.json({ ok: true, gain: result.gain });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[fixed-assets POST]", e);
    return NextResponse.json({ error: "Failed to update fixed assets." }, { status: 500 });
  }
}
