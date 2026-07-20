import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createReceipt, listReceipts } from "@/lib/hms/inventory-receipts";

const QuerySchema = z.object({
  slug: z.string().min(1),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const receipts = await listReceipts(auth.service, auth.tenant.id, { limit: query.limit });
    return NextResponse.json({ receipts });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/receipts GET]", e);
    return NextResponse.json({ error: "Failed to load receipts." }, { status: 500 });
  }
}

const LineSchema = z.object({
  itemId: z.string().min(1),
  qtyReceived: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  locationId: z.string().min(1),
  supplierName: z.string().max(200).optional(),
  procurementReference: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(LineSchema).min(1),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { receipt, error } = await createReceipt(auth.service, {
      tenantId: auth.tenant.id,
      locationId: body.locationId,
      supplierName: body.supplierName,
      procurementReference: body.procurementReference,
      receivedBy: auth.user.id,
      notes: body.notes,
      lines: body.lines.map((l) => ({ itemId: l.itemId, qtyReceived: l.qtyReceived, unitCost: l.unitCost })),
    });
    if (error || !receipt) return NextResponse.json({ error: error ?? "Could not create receipt." }, { status: 400 });

    return NextResponse.json({ receipt });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
