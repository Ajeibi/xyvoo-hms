import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createApprovalThreshold, listApprovalThresholds } from "@/lib/hms/procurement-orders";

const APPROVER_ROLES = ["auto", "gm", "finance"] as const;

const QuerySchema = z.object({ slug: z.string().min(1) });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const thresholds = await listApprovalThresholds(auth.service, auth.tenant.id);
    return NextResponse.json({ thresholds });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const PostSchema = z.object({
  slug: z.string().min(1),
  department: z.string().min(1).max(120),
  minAmount: z.coerce.number().min(0),
  maxAmount: z.coerce.number().min(0).nullable().optional(),
  approverRole: z.enum(APPROVER_ROLES),
  sortOrder: z.coerce.number().int().optional(),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { threshold, error } = await createApprovalThreshold(auth.service, {
      tenantId: auth.tenant.id,
      department: body.department,
      minAmount: body.minAmount,
      maxAmount: body.maxAmount ?? null,
      approverRole: body.approverRole,
      sortOrder: body.sortOrder,
    });
    if (error || !threshold) return NextResponse.json({ error: error ?? "Could not create threshold." }, { status: 400 });
    return NextResponse.json({ threshold });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
