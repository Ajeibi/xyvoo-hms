import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { ACCOUNTS_DEPARTMENTS, listJournalEntries, postJournalEntry } from "@/lib/hms/journal-entries";

const LineSchema = z.object({
  accountId: z.string().uuid(),
  department: z.enum(ACCOUNTS_DEPARTMENTS).nullable().optional(),
  description: z.string().max(240).nullable().optional(),
  debit: z.number().min(0),
  credit: z.number().min(0),
});

const PostBody = z.object({
  slug: z.string().min(1),
  entryDate: z.string().min(1),
  memo: z.string().min(1).max(240),
  reference: z.string().max(120).nullable().optional(),
  lines: z.array(LineSchema).min(2),
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

    const entries = await listJournalEntries(auth.service, auth.tenant.id, { limit: 200 });
    return NextResponse.json({ entries });
  } catch (e) {
    console.error("[journal-entries GET]", e);
    return NextResponse.json({ error: "Failed to load journal entries." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canPostJournalEntry) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await postJournalEntry(auth.service, {
      tenantId: auth.tenant.id,
      entryDate: body.entryDate,
      memo: body.memo,
      reference: body.reference ?? null,
      createdBy: auth.user.id,
      lines: body.lines.map((l) => ({
        accountId: l.accountId,
        department: l.department ?? null,
        description: l.description ?? null,
        debit: l.debit,
        credit: l.credit,
      })),
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[journal-entries POST]", e);
    return NextResponse.json({ error: "Failed to post journal entry." }, { status: 500 });
  }
}
