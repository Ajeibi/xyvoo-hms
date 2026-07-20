import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { recordPurchaseOrderInvoice } from "@/lib/hms/procurement-orders";

const PostSchema = z.object({
  slug: z.string().min(1),
  invoiceNumber: z.string().min(1).max(120),
  invoiceAmount: z.coerce.number().min(0),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const result = await recordPurchaseOrderInvoice(auth.service, auth.tenant.id, id, {
      invoiceNumber: body.invoiceNumber,
      invoiceAmount: body.invoiceAmount,
      recordedBy: auth.user.id,
    });
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ matched: result.matched, variance: result.variance });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
