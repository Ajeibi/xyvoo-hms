import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { listProcurementReceipts, receiveAgainstPurchaseOrder } from "@/lib/hms/procurement-receiving";

const QuerySchema = z.object({ slug: z.string().min(1), limit: z.coerce.number().int().positive().max(500).optional() });

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug"), limit: url.searchParams.get("limit") ?? undefined });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const receipts = await listProcurementReceipts(auth.service, auth.tenant.id, { limit: query.limit });
    return NextResponse.json({ receipts });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[procurement/receiving GET]", e);
    return NextResponse.json({ error: "Failed to load receiving records." }, { status: 500 });
  }
}

const DISCREPANCY_VALUES = ["none", "short_delivered", "damaged", "wrong_item", "failed_inspection"] as const;

const LineSchema = z.object({
  purchaseOrderLineId: z.string().min(1),
  itemId: z.string().min(1),
  qtyReceived: z.coerce.number().min(0),
  qtyRejected: z.coerce.number().min(0).default(0),
  unitCost: z.coerce.number().min(0),
  discrepancyType: z.enum(DISCREPANCY_VALUES).default("none"),
  qualityPassed: z.boolean().default(true),
  qualityNotes: z.string().max(1000).optional(),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  poId: z.string().min(1),
  locationId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  lines: z.array(LineSchema).min(1),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { receipt, error } = await receiveAgainstPurchaseOrder(auth.service, {
      tenantId: auth.tenant.id,
      poId: body.poId,
      locationId: body.locationId,
      receivedBy: auth.user.id,
      notes: body.notes,
      lines: body.lines,
    });
    if (error || !receipt) return NextResponse.json({ error: error ?? "Could not record receiving note." }, { status: 400 });
    return NextResponse.json({ receipt });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
