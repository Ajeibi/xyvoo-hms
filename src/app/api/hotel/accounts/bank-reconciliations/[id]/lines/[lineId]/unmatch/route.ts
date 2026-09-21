import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { unmatchLine } from "@/lib/hms/bank-reconciliation";

const PostSchema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const { lineId } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canReconcileBankAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await unmatchLine(auth.service, auth.tenant.id, lineId);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[.../unmatch POST]", e);
    return NextResponse.json({ error: "Failed to unmatch." }, { status: 500 });
  }
}
