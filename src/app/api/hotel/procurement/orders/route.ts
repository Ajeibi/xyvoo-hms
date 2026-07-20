import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createPurchaseOrder, listPurchaseOrders } from "@/lib/hms/procurement-orders";
import type { PurchaseOrderStatus } from "@/lib/hms/procurement-types";

const STATUS_VALUES = [
  "draft",
  "pending_approval",
  "approved",
  "ordered",
  "partially_received",
  "received",
  "closed",
  "rejected",
  "cancelled",
] as const;

const QuerySchema = z.object({
  slug: z.string().min(1),
  status: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });
    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const status = query.status
      ?.split(",")
      .map((s) => s.trim())
      .filter((s): s is PurchaseOrderStatus => (STATUS_VALUES as readonly string[]).includes(s));

    const orders = await listPurchaseOrders(auth.service, auth.tenant.id, { status: status?.length ? status : undefined, limit: query.limit });
    return NextResponse.json({ orders });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    console.error("[procurement/orders GET]", e);
    return NextResponse.json({ error: "Failed to load purchase orders." }, { status: 500 });
  }
}

const LineSchema = z.object({
  requisitionLineId: z.string().optional(),
  itemId: z.string().optional(),
  description: z.string().min(1).max(300),
  quantity: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  vendorId: z.string().min(1),
  department: z.string().min(1).max(120),
  currency: z.string().max(6).optional(),
  fxRate: z.coerce.number().positive().optional(),
  tax: z.coerce.number().min(0).optional(),
  expectedDeliveryDate: z.string().optional(),
  notes: z.string().max(2000).optional(),
  isManual: z.boolean(),
  manualReason: z.string().max(500).optional(),
  requestedBy: z.string().optional(),
  lines: z.array(LineSchema).min(1),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { order, error } = await createPurchaseOrder(auth.service, {
      tenantId: auth.tenant.id,
      vendorId: body.vendorId,
      department: body.department,
      currency: body.currency,
      fxRate: body.fxRate,
      tax: body.tax,
      expectedDeliveryDate: body.expectedDeliveryDate,
      notes: body.notes,
      isManual: body.isManual,
      manualReason: body.manualReason,
      requestedBy: body.requestedBy,
      createdBy: auth.user.id,
      lines: body.lines,
    });
    if (error || !order) return NextResponse.json({ error: error ?? "Could not create purchase order." }, { status: 400 });
    return NextResponse.json({ order });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
