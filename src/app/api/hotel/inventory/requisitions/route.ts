import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { createRequisition, listRequisitions } from "@/lib/hms/inventory-requisitions";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import type { InventoryRequisitionStatus } from "@/lib/hms/inventory-types";

const STATUS_VALUES = [
  "pending",
  "approved",
  "partially_issued",
  "issued",
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
      .filter((s): s is InventoryRequisitionStatus =>
        (STATUS_VALUES as readonly string[]).includes(s),
      );

    const requisitions = await listRequisitions(auth.service, auth.tenant.id, {
      status: status?.length ? status : undefined,
      limit: query.limit,
    });
    return NextResponse.json({ requisitions });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[inventory/requisitions GET]", e);
    return NextResponse.json({ error: "Failed to load requisitions." }, { status: 500 });
  }
}

const LineSchema = z.object({
  itemId: z.string().min(1),
  qty: z.coerce.number().positive(),
});

const PostSchema = z.object({
  slug: z.string().min(1),
  requestingDepartment: z.string().min(1).max(120),
  fromLocationId: z.string().min(1),
  notes: z.string().max(2000).optional(),
  lines: z.array(LineSchema).min(1),
});

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const departmentRole =
      typeof auth.user.user_metadata?.department_role === "string" ? auth.user.user_metadata.department_role : null;
    const canOriginate = departmentRole === "Store / Inventory" || isAdminLikeRole(auth.role);
    if (!canOriginate) {
      return NextResponse.json(
        { error: "Only Inventory or an Admin/GM can raise a requisition. Procurement sources against approved requisitions." },
        { status: 403 },
      );
    }

    const { requisition, error } = await createRequisition(auth.service, {
      tenantId: auth.tenant.id,
      requestingDepartment: body.requestingDepartment,
      fromLocationId: body.fromLocationId,
      requestedBy: auth.user.id,
      notes: body.notes,
      lines: body.lines,
    });
    if (error || !requisition) {
      return NextResponse.json({ error: error ?? "Could not create requisition." }, { status: 400 });
    }

    return NextResponse.json({ requisition });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
