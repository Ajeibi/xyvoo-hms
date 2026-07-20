import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getHousekeepingCapabilities } from "@/lib/hms/housekeeping-rbac";
import { generateStayoverRunSheet } from "@/lib/hms/housekeeping-tasks";

const BodySchema = z.object({ slug: z.string().min(1) });

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getHousekeepingCapabilities({ membershipRole: auth.role, departmentRole: auth.departmentRole });
    if (!caps.isSupervisor) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const result = await generateStayoverRunSheet(auth.service, auth.tenant.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    console.error("[housekeeping generate]", e);
    return NextResponse.json({ error: "Failed to generate today's tasks." }, { status: 500 });
  }
}
