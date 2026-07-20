import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { deleteApprovalThreshold, updateApprovalThreshold } from "@/lib/hms/procurement-orders";

const APPROVER_ROLES = ["auto", "gm", "finance"] as const;

const PatchSchema = z.object({
  slug: z.string().min(1),
  department: z.string().min(1).max(120).optional(),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).nullable().optional(),
  approverRole: z.enum(APPROVER_ROLES).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { threshold, error } = await updateApprovalThreshold(auth.service, auth.tenant.id, id, {
      department: body.department,
      minAmount: body.minAmount,
      maxAmount: body.maxAmount,
      approverRole: body.approverRole,
      sortOrder: body.sortOrder,
    });
    if (error || !threshold) return NextResponse.json({ error: error ?? "Could not update threshold." }, { status: 400 });
    return NextResponse.json({ threshold });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const DeleteSchema = z.object({ slug: z.string().min(1) });

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const query = DeleteSchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { error } = await deleteApprovalThreshold(auth.service, auth.tenant.id, id);
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
