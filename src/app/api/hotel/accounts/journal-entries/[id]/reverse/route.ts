import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { reverseJournalEntry } from "@/lib/hms/journal-entries";

const BodySchema = z.object({ slug: z.string().min(1), memo: z.string().max(240).optional() });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canReverseJournalEntry) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await reverseJournalEntry(auth.service, {
      tenantId: auth.tenant.id,
      journalEntryId: id,
      actorUserId: auth.user.id,
      memo: body.memo,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[journal-entries/[id]/reverse POST]", e);
    return NextResponse.json({ error: "Failed to reverse journal entry." }, { status: 500 });
  }
}
