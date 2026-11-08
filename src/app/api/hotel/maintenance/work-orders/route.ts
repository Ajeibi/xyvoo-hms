import { NextResponse } from "next/server";
import { z } from "zod";
import { authMaintenance, fail, isFailure } from "@/lib/hms/maintenance-api";
import { createWorkOrder, listWorkOrders } from "@/lib/hms/maintenance-orders";
import { takeRoomOutOfOrder } from "@/lib/hms/maintenance-rooms";
import { WO_PRIORITIES, WO_SOURCES, WO_STATUSES } from "@/lib/hms/maintenance-shared";

/**
 * GET  /api/hotel/maintenance/work-orders?slug=...&status=open|all|<status>&priority=&technicianId=&roomUnitId=&assetId=&q=
 * POST /api/hotel/maintenance/work-orders: raise a work order. This is the route other modules
 *   (housekeeping, front desk, guest requests) call to report a fault. Any signed-in member of the
 *   hotel may report. Send `externalRef` (your own id for the fault) so a retry doesn't make a
 *   second order. Assigning, and taking the room out of order, need Maintenance access.
 */
const PostSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  category: z.string().max(80).optional(),
  priority: z.enum(WO_PRIORITIES).optional(),
  source: z.enum(WO_SOURCES).optional(),
  roomUnitId: z.string().uuid().optional(),
  roomCode: z.string().max(20).optional(),
  locationText: z.string().max(200).optional(),
  assetId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  externalRef: z.string().max(120).optional(),
  takeRoomOutOfOrder: z.boolean().optional(),
  expectedBackAt: z.string().optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const a = await authMaintenance(url.searchParams.get("slug"));
  if (isFailure(a)) return a;
  const status = url.searchParams.get("status") ?? "open";
  const priority = url.searchParams.get("priority");
  const orders = await listWorkOrders(a.auth.service, a.auth.tenant.id, {
    status: status === "open" || status === "all" || (WO_STATUSES as readonly string[]).includes(status) ? (status as never) : "open",
    priority: priority && (WO_PRIORITIES as readonly string[]).includes(priority) ? (priority as never) : undefined,
    technicianId: url.searchParams.get("technicianId") ?? undefined,
    roomUnitId: url.searchParams.get("roomUnitId") ?? undefined,
    assetId: url.searchParams.get("assetId") ?? undefined,
    search: url.searchParams.get("q") ?? undefined,
  });
  return NextResponse.json({ workOrders: orders });
}

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const a = await authMaintenance(body.slug);
    if (isFailure(a)) return a;
    const { auth, caps, actor } = a;
    if ((body.technicianId || body.takeRoomOutOfOrder) && !caps.canManage) {
      return fail("Only Maintenance or a manager can assign a technician or take a room out of order.", 403);
    }

    let roomUnitId = body.roomUnitId;
    if (!roomUnitId && body.roomCode) {
      const { data: unit } = await auth.service
        .schema("hotel")
        .from("room_units")
        .select("id")
        .eq("tenant_id", auth.tenant.id)
        .eq("room_code", body.roomCode.trim())
        .maybeSingle();
      if (!unit) return fail(`Room ${body.roomCode} was not found.`, 404);
      roomUnitId = unit.id as string;
    }

    const result = await createWorkOrder(auth.service, {
      tenantId: auth.tenant.id,
      title: body.title,
      description: body.description,
      category: body.category,
      priority: body.priority,
      source: body.source,
      roomUnitId,
      locationText: body.locationText,
      assetId: body.assetId,
      technicianId: body.technicianId,
      externalRef: body.externalRef,
      actor,
    });
    if (result.error || !result.workOrder) return fail(result.error ?? "Could not save.");

    let roomError: string | null = null;
    if (body.takeRoomOutOfOrder && !result.existing) {
      const r = await takeRoomOutOfOrder(auth.service, auth.tenant.id, result.workOrder.id, actor, { expectedBackAt: body.expectedBackAt });
      roomError = r.error;
    }
    return NextResponse.json(
      { ok: true, workOrder: result.workOrder, existing: Boolean(result.existing), roomError },
      { status: result.existing ? 200 : 201 },
    );
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not raise the work order.", 500);
  }
}
