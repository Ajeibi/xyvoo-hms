import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { inspectHousekeepingTask } from "@/lib/hms/housekeeping-tasks";

const PostSchema = z.object({
  slug: z.string().min(1),
  result: z.enum(["pass", "fail"]),
  note: z.string().max(500).optional(),
});

/** Supervisor inspection sign-off (HK-19/20) — separation of duties enforced in the domain layer. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.canInspect) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await inspectHousekeepingTask(auth.service, {
      tenantId: auth.tenant.id,
      taskId: id,
      inspectorUserId: auth.user.id,
      result: body.result,
      note: body.note,
    });

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping task inspect]", e);
    return NextResponse.json({ error: "Failed to record inspection." }, { status: 500 });
  }
}
