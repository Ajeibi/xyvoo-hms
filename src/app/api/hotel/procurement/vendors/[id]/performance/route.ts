import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { addVendorPerformanceReview } from "@/lib/hms/procurement-vendors";

const PostSchema = z.object({
  slug: z.string().min(1),
  poId: z.string().optional(),
  onTime: z.boolean(),
  qualityScore: z.coerce.number().int().min(1).max(5),
  notes: z.string().max(2000).optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { review, error } = await addVendorPerformanceReview(auth.service, {
      tenantId: auth.tenant.id,
      vendorId: id,
      poId: body.poId,
      onTime: body.onTime,
      qualityScore: body.qualityScore,
      notes: body.notes,
      reviewedBy: auth.user.id,
    });
    if (error || !review) return NextResponse.json({ error: error ?? "Could not save review." }, { status: 400 });
    return NextResponse.json({ review });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
