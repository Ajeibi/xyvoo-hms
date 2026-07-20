import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { transitionHousekeepingTaskStatus } from "@/lib/hms/housekeeping-tasks";
import { createHousekeepingSupplyRequisition, postHousekeepingConsumption } from "@/lib/hms/housekeeping-inventory";

const LineSchema = z.object({ itemId: z.string().uuid(), qty: z.number().min(0).max(9999) });

const PostSchema = z.object({
  slug: z.string().min(1),
  lines: z.array(LineSchema).default([]),
  missingLines: z.array(LineSchema).default([]),
});

/**
 * Completes a cleaning task (dirty/cleaning_in_progress -> cleaned) while, in the same
 * action, posting par-based supply consumption to Inventory's ledger (HK-25) and raising a
 * requisition for anything flagged missing (HK-26). Consumption/requisition problems are
 * reported but never block the room from being marked cleaned.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canAccess) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const warnings: string[] = [];

    if (body.lines.length > 0) {
      const consumption = await postHousekeepingConsumption(auth.service, {
        tenantId: auth.tenant.id,
        taskId: id,
        performedBy: auth.user.id,
        lines: body.lines,
      });
      warnings.push(...consumption.errors);
    }

    if (body.missingLines.length > 0) {
      const supplyRequest = await createHousekeepingSupplyRequisition(auth.service, {
        tenantId: auth.tenant.id,
        requestedBy: auth.user.id,
        notes: `Flagged missing while completing housekeeping task ${id}.`,
        lines: body.missingLines,
      });
      if (!supplyRequest.ok) warnings.push(supplyRequest.error);
    }

    const result = await transitionHousekeepingTaskStatus(auth.service, {
      tenantId: auth.tenant.id,
      taskId: id,
      toStatus: "cleaned",
      actorUserId: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, warnings });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping task complete]", e);
    return NextResponse.json({ error: "Failed to complete task." }, { status: 500 });
  }
}
