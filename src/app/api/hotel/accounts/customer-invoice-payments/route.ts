import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { createReceiptRun } from "@/lib/hms/customer-invoice-payments";

const PostBody = z.object({
  slug: z.string().min(1),
  paymentDate: z.string().min(1),
  bankAccountId: z.string().uuid(),
  reference: z.string().max(80).optional(),
  invoiceIds: z.array(z.string().uuid()).min(1),
});

export async function POST(req: Request) {
  try {
    const body = PostBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canReceivePayment) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await createReceiptRun(auth.service, {
      tenantId: auth.tenant.id,
      paymentDate: body.paymentDate,
      bankAccountId: body.bankAccountId,
      reference: body.reference ?? null,
      invoiceIds: body.invoiceIds,
      createdBy: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error, paidInvoiceIds: result.paidInvoiceIds }, { status: 400 });
    return NextResponse.json({ ok: true, id: result.id, paidInvoiceIds: result.paidInvoiceIds });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[customer-invoice-payments POST]", e);
    return NextResponse.json({ error: "Failed to record receipt." }, { status: 500 });
  }
}
