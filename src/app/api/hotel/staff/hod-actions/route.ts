import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { isAdminLikeRole } from "@/lib/hms/department-access";
import { HOD_ACTIONS, loadHodOverrides, resolveHodOnly } from "@/lib/hms/capabilities";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { CREATABLE_DEPARTMENT_ROLES } from "@/lib/hms/role-sections";

const DEPARTMENTS = CREATABLE_DEPARTMENT_ROLES.filter((r) => r !== "Admin / GM");

const UpdateSchema = z.object({
  slug: z.string().min(1),
  department_role: z.enum(DEPARTMENTS as [string, ...string[]]),
  action_key: z.enum(HOD_ACTIONS as [string, ...string[]]),
  /** true: staff need a HOD for this action; false: the department's staff may do it themselves. */
  enabled: z.boolean(),
});

/** The HOD-only list for every department, defaults with this hotel's changes applied. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can view this." }, { status: 403 });

  const overrides = await loadHodOverrides(auth.service, auth.tenant.id);
  const departments = DEPARTMENTS.map((department) => ({
    department,
    hodOnly: [...resolveHodOnly(department, overrides)],
  }));
  return NextResponse.json({ departments });
}

export async function PUT(req: Request) {
  try {
    const body = UpdateSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!isAdminLikeRole(auth.role)) return NextResponse.json({ error: "Only an owner or admin can change this." }, { status: 403 });

    const { error } = await auth.service
      .schema("hotel")
      .from("hod_only_actions")
      .upsert(
        {
          tenant_id: auth.tenant.id,
          department_role: body.department_role,
          action_key: body.action_key,
          enabled: body.enabled,
          updated_by: auth.user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,department_role,action_key" },
      );
    if (error) return NextResponse.json({ error: error.message || "Unable to save." }, { status: 400 });

    await writeAuditLog({
      tenantId: auth.tenant.id,
      actorUserId: auth.user.id,
      action: "hod_only_action_changed",
      entityType: "hod_only_action",
      after: { department_role: body.department_role, action_key: body.action_key, enabled: body.enabled },
    });

    const overrides = await loadHodOverrides(auth.service, auth.tenant.id, body.department_role);
    return NextResponse.json({ ok: true, hodOnly: [...resolveHodOnly(body.department_role, overrides)] });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save." }, { status: 500 });
  }
}
