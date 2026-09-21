import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { addManualStatementLine } from "@/lib/hms/bank-reconciliation";

const PostSchema = z.object({
  slug: z.string().min(1),
  lineDate: z.string().min(1),
  description: z.string().min(1),
  amount: z.coerce.number(),
  reference: z.string().max(80).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canReconcileBankAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await addManualStatementLine(auth.service, {
      tenantId: auth.tenant.id,
      reconciliationId: id,
      lineDate: body.lineDate,
      description: body.description,
      amount: body.amount,
      reference: body.reference,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[bank-reconciliations/[id]/lines POST]", e);
    return NextResponse.json({ error: "Failed to add line." }, { status: 500 });
  }
}
