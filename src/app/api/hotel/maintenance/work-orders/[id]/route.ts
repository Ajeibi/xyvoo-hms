import { NextResponse } from "next/server";
import { z } from "zod";
import { authMaintenance, fail, isFailure } from "@/lib/hms/maintenance-api";
import { addComment, assignTechnician, changePriority, changeStatus, getWorkOrder, updateDetails } from "@/lib/hms/maintenance-orders";
import { adoptBlock, releaseRoomForOrder, takeRoomOutOfOrder } from "@/lib/hms/maintenance-rooms";
import { setLabour } from "@/lib/hms/maintenance-parts";
import { WO_PRIORITIES, WO_STATUSES } from "@/lib/hms/maintenance-shared";

const Body = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), action: z.literal("comment"), text: z.string().min(1).max(2000) }),
  z.object({ slug: z.string().min(1), action: z.literal("assign"), technicianId: z.string().uuid().nullable() }),
  z.object({ slug: z.string().min(1), action: z.literal("priority"), priority: z.enum(WO_PRIORITIES) }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("status"),
    status: z.enum(WO_STATUSES),
    holdReason: z.string().max(500).optional(),
    resolutionNotes: z.string().max(2000).optional(),
    labourMinutes: z.number().min(0).max(100000).optional(),
  }),
  z.object({
    slug: z.string().min(1),
    action: z.literal("details"),
    title: z.string().max(200).optional(),
    description: z.string().max(2000).nullable().optional(),
    category: z.string().max(80).nullable().optional(),
    locationText: z.string().max(200).nullable().optional(),
  }),
  z.object({ slug: z.string().min(1), action: z.literal("out_of_order"), expectedBackAt: z.string().optional() }),
  z.object({ slug: z.string().min(1), action: z.literal("release_room") }),
  z.object({ slug: z.string().min(1), action: z.literal("adopt_block"), blockId: z.string().uuid() }),
  z.object({ slug: z.string().min(1), action: z.literal("labour"), minutes: z.number().min(0).max(100000) }),
]);

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const a = await authMaintenance(new URL(req.url).searchParams.get("slug"));
  if (isFailure(a)) return a;
  const detail = await getWorkOrder(a.auth.service, a.auth.tenant.id, id);
  if (!detail) return fail("Work order not found.", 404);
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = Body.parse(await req.json());
    // Anyone can add a note; everything else is Maintenance or a manager.
    const a = await authMaintenance(body.slug, body.action === "comment" ? "canReport" : "canManage");
    if (isFailure(a)) return a;
    const { auth, actor } = a;
    const tenantId = auth.tenant.id;
    const db = auth.service;
    let result: { error: string | null; roomReleased?: boolean } = { error: null };

    switch (body.action) {
      case "comment":
        result = await addComment(db, tenantId, id, body.text, actor);
        break;
      case "assign":
        result = await assignTechnician(db, tenantId, id, body.technicianId, actor);
        break;
      case "priority":
        result = await changePriority(db, tenantId, id, body.priority, actor);
        break;
      case "status":
        result = await changeStatus(db, tenantId, id, body.status, actor, {
          holdReason: body.holdReason,
          resolutionNotes: body.resolutionNotes,
          labourMinutes: body.labourMinutes,
        });
        break;
      case "details":
        result = await updateDetails(db, tenantId, id, body, actor);
        break;
      case "out_of_order":
        result = await takeRoomOutOfOrder(db, tenantId, id, actor, { expectedBackAt: body.expectedBackAt });
        break;
      case "release_room": {
        const r = await releaseRoomForOrder(db, tenantId, id, actor);
        result = { error: r.released ? null : "There is no active room block on this order.", roomReleased: r.released };
        break;
      }
      case "adopt_block":
        result = await adoptBlock(db, tenantId, id, body.blockId, actor);
        break;
      case "labour":
        result = await setLabour(db, tenantId, id, body.minutes, actor);
        break;
    }
    if (result.error) return fail(result.error);
    return NextResponse.json({ ok: true, roomReleased: result.roomReleased ?? false });
  } catch (e) {
    if (e instanceof z.ZodError) return fail(e.issues[0]?.message ?? "Check the details and try again.");
    return fail("Could not update the work order.", 500);
  }
}
