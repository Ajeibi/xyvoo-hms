import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { assignHousekeepingTask } from "@/lib/hms/housekeeping-tasks";

const PatchSchema = z.object({
  slug: z.string().min(1),
  staffUserId: z.string().uuid().nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canManageAssignments) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await assignHousekeepingTask(auth.service, {
      tenantId: auth.tenant.id,
      taskId: id,
      staffUserId: body.staffUserId,
      actorUserId: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping task assign]", e);
    return NextResponse.json({ error: "Failed to assign task." }, { status: 500 });
  }
}
