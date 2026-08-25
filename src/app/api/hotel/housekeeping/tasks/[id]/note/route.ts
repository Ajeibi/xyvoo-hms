import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { setHousekeepingTaskNote } from "@/lib/hms/housekeeping-tasks";

const PatchSchema = z.object({
  slug: z.string().min(1),
  note: z.string().max(120).nullable(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canEditAssignedNote) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await setHousekeepingTaskNote(auth.service, {
      tenantId: auth.tenant.id,
      taskId: id,
      note: body.note,
      actorUserId: auth.user.id,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping task note]", e);
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
