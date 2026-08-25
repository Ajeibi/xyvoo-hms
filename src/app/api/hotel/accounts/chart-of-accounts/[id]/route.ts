import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getAccountsCapabilities } from "@/lib/hms/accounts-rbac";
import { ACCOUNT_TYPES, updateAccount } from "@/lib/hms/chart-of-accounts";

const PatchBody = z
  .object({
    slug: z.string().min(1),
    name: z.string().min(1).max(120).optional(),
    type: z.enum(ACCOUNT_TYPES).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.name != null || d.type != null || d.isActive != null, { message: "No updates provided" });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchBody.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getAccountsCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageChartOfAccounts) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await updateAccount(auth.service, {
      tenantId: auth.tenant.id,
      id,
      name: body.name,
      type: body.type,
      isActive: body.isActive,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[chart-of-accounts PATCH]", e);
    return NextResponse.json({ error: "Failed to update account." }, { status: 500 });
  }
}
