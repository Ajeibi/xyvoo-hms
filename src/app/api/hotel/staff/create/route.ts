import { NextResponse } from "next/server";
import { z } from "zod";
import { insertHotelMembership } from "@/lib/hms/membership-role";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { linkLoginToEmployee } from "@/lib/hms/hr-link";
import { normalizeUsername, staffInternalEmail } from "@/lib/hms/staff-identity";
import { DepartmentRoleSchema, requireStaffManager } from "../_lib";

const CreateStaffSchema = z.object({
  slug: z.string().min(1),
  full_name: z.string().trim().min(2),
  department_role: DepartmentRoleSchema,
  level: z.enum(["hod", "staff"]).default("staff"),
  /** What the person types at sign-in (with @hotel). Required for staff. */
  username: z.string().optional(),
  /** A real email: the login for a HOD without a username, optional recovery contact otherwise. */
  email: z.string().email().optional().or(z.literal("")),
  /** The temporary password; the person must replace it at first sign-in. */
  password: z.string().min(8).max(72),
  /** The HR record this person is (optional). Links the login and the HR record to each other. */
  hr_employee_id: z.string().uuid().optional().or(z.literal("")),
});

export async function POST(req: Request) {
  try {
    const parsed = CreateStaffSchema.parse(await req.json());
    const manager = await requireStaffManager(parsed.slug);
    if ("error" in manager) return NextResponse.json({ error: manager.error }, { status: manager.status });

    const isGm = parsed.department_role === "Admin / GM";

    // Who may create whom: an owner/admin makes HODs (and staff anywhere); a HOD makes staff in their own department only.
    if (parsed.level === "hod" && !manager.isAdmin) {
      return NextResponse.json({ error: "Only an owner or admin can create a head of department." }, { status: 403 });
    }
    if (!manager.isAdmin && parsed.department_role !== manager.departmentRole) {
      return NextResponse.json({ error: "You can only create staff in your own department." }, { status: 403 });
    }
    if (isGm && (parsed.level !== "hod" || !manager.isAdmin)) {
      return NextResponse.json({ error: "Only an owner or admin can create an Admin / GM login." }, { status: 403 });
    }

    const username = parsed.username?.trim() ? normalizeUsername(parsed.username) : null;
    if (parsed.username?.trim() && !username) {
      return NextResponse.json(
        { error: "A username is 3-32 letters, digits, dots, dashes or underscores, with no spaces." },
        { status: 400 },
      );
    }
    const realEmail = parsed.email?.trim() || null;
    if (parsed.level === "staff" && !username) {
      return NextResponse.json({ error: "Choose a username for this person." }, { status: 400 });
    }
    if (!username && !realEmail) {
      return NextResponse.json({ error: "Give the login an email or a username." }, { status: 400 });
    }

    const hotelKey = manager.tenant.subdomain || manager.tenant.name || manager.tenantId;
    const loginEmail = username ? staffInternalEmail(username, hotelKey) : realEmail!;

    const { data: createdUser, error: createUserError } = await manager.service.auth.admin.createUser({
      email: loginEmail,
      password: parsed.password,
      email_confirm: true,
      // Name only. The department and level live on the membership, which the person can't edit.
      user_metadata: { full_name: parsed.full_name, tenant_slug: parsed.slug },
    });

    if (createUserError || !createdUser.user) {
      const taken = /already|registered|exists/i.test(createUserError?.message ?? "");
      return NextResponse.json(
        { error: taken ? "That username or email is already in use." : createUserError?.message || "Unable to create the login." },
        { status: taken ? 409 : 400 },
      );
    }

    const { error: membershipError } = await insertHotelMembership(manager.service, {
      tenant_id: manager.tenantId,
      user_id: createdUser.user.id,
      role: isGm ? "admin" : "staff",
      department_role: parsed.department_role,
      staff_level: parsed.level,
      username,
      contact_email: username ? realEmail : null,
      created_by: manager.userId,
      must_change_password: true,
    });

    if (membershipError) {
      // Nothing was ever signed in with this half-made login, so remove it rather than leave it orphaned.
      await manager.service.auth.admin.deleteUser(createdUser.user.id);
      const duplicate = /duplicate|unique/i.test(membershipError.message);
      return NextResponse.json(
        { error: duplicate ? "That username is already taken in this hotel." : membershipError.message || "Unable to assign the login to this hotel." },
        { status: duplicate ? 409 : 400 },
      );
    }

    await manager.service
      .schema("hotel")
      .from("profiles")
      .upsert({ tenant_id: manager.tenantId, user_id: createdUser.user.id, contact_name: parsed.full_name }, { onConflict: "user_id" });

    await writeAuditLog({
      tenantId: manager.tenantId,
      actorUserId: manager.userId,
      action: "staff_login_created",
      entityType: "staff_login",
      entityId: createdUser.user.id,
      after: { full_name: parsed.full_name, department_role: parsed.department_role, level: parsed.level, username },
    });

    // Tie the login to its HR record. The login already exists, so a problem here is reported, not fatal.
    let hrLinkError: string | null = null;
    if (parsed.hr_employee_id) {
      const { data: employee } = await manager.service
        .schema("hotel")
        .from("hr_employees")
        .select("department")
        .eq("tenant_id", manager.tenantId)
        .eq("id", parsed.hr_employee_id)
        .maybeSingle();
      if (!manager.isAdmin && employee?.department && employee.department !== parsed.department_role) {
        hrLinkError = "That HR record belongs to another department, so it wasn't linked.";
      } else {
        const linked = await linkLoginToEmployee(manager.service, manager.tenantId, createdUser.user.id, parsed.hr_employee_id);
        if (!linked.ok) hrLinkError = linked.error;
      }
    }

    return NextResponse.json({ success: true, signInName: username ? `${username}@${hotelKey}` : loginEmail, hrLinkError });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to create the login." }, { status: 500 });
  }
}
