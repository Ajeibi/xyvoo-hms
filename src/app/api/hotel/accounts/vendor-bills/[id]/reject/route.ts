import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { rejectVendorBill } from "@/lib/hms/vendor-bills";

const BodySchema = z.object({ slug: z.string().min(1), reason: z.string().min(1).max(500) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canApproveVendorBill) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await rejectVendorBill(auth.service, {
      tenantId: auth.tenant.id,
      billId: id,
      rejectedBy: auth.user.id,
      reason: body.reason,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[vendor-bill reject]", e);
    return NextResponse.json({ error: "Failed to reject bill." }, { status: 500 });
  }
}
