import { NextResponse } from "next/server";
import { z } from "zod";
import { getDepartmentLoginsForTenant } from "@/lib/hms/department-logins";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { canManageTarget, readStaffTarget, requireStaffManager } from "./_lib";

const QuerySchema = z.object({ slug: z.string().min(1) });

const ActionSchema = z.discriminatedUnion("action", [
  z.object({ slug: z.string().min(1), user_id: z.string().uuid(), action: z.literal("suspend") }),
  z.object({ slug: z.string().min(1), user_id: z.string().uuid(), action: z.literal("reactivate") }),
  z.object({ slug: z.string().min(1), user_id: z.string().uuid(), action: z.literal("reset_pin") }),
  z.object({
    slug: z.string().min(1),
    user_id: z.string().uuid(),
    action: z.literal("reset_password"),
    /** The new temporary password; the person must replace it at next sign-in. */
    password: z.string().min(8).max(72),
  }),
]);

/** The team the caller may see: an owner/admin sees every login, a HOD only their own department. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = QuerySchema.parse({ slug: url.searchParams.get("slug") });
    const manager = await requireStaffManager(query.slug);
    if ("error" in manager) return NextResponse.json({ error: manager.error }, { status: manager.status });

    const all = await getDepartmentLoginsForTenant(manager.tenantId, { includeSuspended: true });
    const logins = manager.isAdmin ? all : all.filter((l) => l.departmentRole === manager.departmentRole);
    return NextResponse.json({ logins });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to load logins." }, { status: 500 });
  }
}

/** Suspend, reactivate or reset the password of one login. Staff are never deleted, so their history keeps their name. */
export async function PATCH(req: Request) {
  try {
    const body = ActionSchema.parse(await req.json());
    const manager = await requireStaffManager(body.slug);
    if ("error" in manager) return NextResponse.json({ error: manager.error }, { status: manager.status });

    const target = await readStaffTarget(manager.tenantId, body.user_id);
    if (!target) return NextResponse.json({ error: "That login isn't part of this hotel." }, { status: 404 });
    const denied = canManageTarget(manager, target);
    if (denied) return NextResponse.json({ error: denied }, { status: 403 });

    const memberships = () => manager.service.schema("hotel").from("memberships");
    const scope = { tenant_id: manager.tenantId, user_id: body.user_id };

    if (body.action === "suspend") {
      // The membership check shuts the person out of every screen and route on their next request;
      // the ban stops their session from being refreshed, so they can't sign in again either.
      const { error } = await memberships()
        .update({ status: "suspended", suspended_at: new Date().toISOString() })
        .match(scope);
      if (error) return NextResponse.json({ error: error.message || "Unable to suspend." }, { status: 400 });
      await manager.service.auth.admin.updateUserById(body.user_id, { ban_duration: "876000h" });
    } else if (body.action === "reset_pin") {
      // Clears the PIN and any lockout; the person sets a new one.
      const { error } = await memberships().update({ pin_hash: null, pin_failed_count: 0, pin_locked_at: null }).match(scope);
      if (error) return NextResponse.json({ error: error.message || "Unable to reset the PIN." }, { status: 400 });
    } else if (body.action === "reactivate") {
      const { error } = await memberships().update({ status: "active", suspended_at: null }).match(scope);
      if (error) return NextResponse.json({ error: error.message || "Unable to reactivate." }, { status: 400 });
      await manager.service.auth.admin.updateUserById(body.user_id, { ban_duration: "none" });
    } else {
      const { error } = await manager.service.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return NextResponse.json({ error: error.message || "Unable to reset the password." }, { status: 400 });
      await memberships().update({ must_change_password: true }).match(scope);
    }

    await writeAuditLog({
      tenantId: manager.tenantId,
      actorUserId: manager.userId,
      action: `staff_login_${body.action}`,
      entityType: "staff_login",
      entityId: body.user_id,
      after: { department_role: target.departmentRole, level: target.staffLevel },
    });

    const logins = await getDepartmentLoginsForTenant(manager.tenantId, { includeSuspended: true });
    return NextResponse.json({ ok: true, login: logins.find((l) => l.userId === body.user_id) ?? null });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to update the login." }, { status: 500 });
  }
}
