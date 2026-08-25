import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { computeNightAuditBreakdown, listNightAuditRuns, runNightAudit } from "@/lib/hms/night-audit";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const PreviewQuery = z.object({ slug: z.string().min(1), date: z.string().regex(DATE_RE) });
const PostBody = z.object({ slug: z.string().min(1), date: z.string().regex(DATE_RE) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");
    const date = url.searchParams.get("date");
    if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

    const auth = await requireHotelApiMember(slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    if (date) {
      const query = PreviewQuery.parse({ slug, date });
      const breakdown = await computeNightAuditBreakdown(auth.service, auth.tenant.id, query.date);
      return NextResponse.json({ breakdown });
    }

    const runs = await listNightAuditRuns(auth.service, auth.tenant.id);
    return NextResponse.json({ runs });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[night-audit GET]", e);
    return NextResponse.json({ error: "Failed to load night audit data." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canRunNightAudit) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await runNightAudit(auth.service, {
      tenantId: auth.tenant.id,
      auditDate: body.date,
      createdBy: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, journalEntryId: result.journalEntryId, breakdown: result.breakdown });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[night-audit POST]", e);
    return NextResponse.json({ error: "Failed to run night audit." }, { status: 500 });
  }
}
