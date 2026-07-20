import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createTransfer, listTransfers } from "@/lib/hms/inventory-transfers";

const TRANSFER_STATUSES = ["pending", "in_transit", "completed", "cancelled"] as const;

const QuerySchema = z.object({
  slug: z.string().min(1),
  status: z.enum(TRANSFER_STATUSES).optional(),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  fromLocationId: z.string().min(1),
  toLocationId: z.string().min(1),
  notes: z.string().max(1000).optional(),
  lines: z
    .array(
      z.object({
        itemId: z.string().min(1),
        qty: z.coerce.number().positive(),
      }),
    )
    .min(1, "Add at least one item."),
});

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({
      slug: url.searchParams.get("slug"),
      status: url.searchParams.get("status") ?? undefined,
    });

    const auth = await requireHotelApiMember(query.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const transfers = await listTransfers(auth.service, auth.tenant.id, {
      status: query.status ? [query.status] : undefined,
    });
    return NextResponse.json({ transfers });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory transfers GET]", e);
    return NextResponse.json({ error: "Failed to load transfers." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { transfer, error } = await createTransfer(auth.service, {
      tenantId: auth.tenant.id,
      fromLocationId: body.fromLocationId,
      toLocationId: body.toLocationId,
      initiatedBy: auth.user.id,
      notes: body.notes,
      lines: body.lines,
    });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json({ transfer });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
